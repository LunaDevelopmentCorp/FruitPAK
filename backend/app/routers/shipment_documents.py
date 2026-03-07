"""Shipment documents router — upload, generate, download, and email documents.

Endpoints:
    GET    /api/containers/{id}/documents                   List documents
    POST   /api/containers/{id}/documents/upload            Upload a document
    POST   /api/containers/{id}/documents/generate-packing-list  Generate PDF
    GET    /api/containers/{id}/documents/{doc_id}/download  Download URL
    DELETE /api/containers/{id}/documents/{doc_id}          Delete document
    POST   /api/containers/{id}/documents/email             Email all docs to client
"""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import require_onboarded, require_permission
from app.database import get_tenant_db
from app.models.public.user import User
from app.models.tenant.client import Client
from app.models.tenant.container import Container
from app.models.tenant.shipment_document import ShipmentDocument
from app.utils.s3 import upload_file, download_file, delete_file, generate_presigned_url, _use_s3
from app.utils.email import send_email
from app.utils.pdf import generate_shipping_pdf, generate_traceability_pdf

router = APIRouter()

# Re-use the packing list data loader from reports
from app.routers.reports import packing_list as _get_packing_list_handler  # noqa: E402


# ── Schemas ──────────────────────────────────────────────────

class DocumentOut(BaseModel):
    id: str
    container_id: str
    doc_type: str
    filename: str
    file_size: int
    mime_type: str
    notes: str | None
    created_at: str


class GeneratePackingListRequest(BaseModel):
    variant: str = "shipping"  # "shipping" or "traceability"


class EmailDocumentsRequest(BaseModel):
    to_email: str | None = None  # Override client email
    subject: str | None = None
    message: str | None = None


# ── Helpers ──────────────────────────────────────────────────

def _s3_key(tenant_schema: str, container_id: str, filename: str) -> str:
    """Build a unique S3 key scoped to tenant and container."""
    return f"{tenant_schema}/containers/{container_id}/{uuid.uuid4().hex[:8]}_{filename}"


async def _get_container(db: AsyncSession, container_id: str) -> Container:
    result = await db.execute(
        select(Container).where(
            Container.id == container_id,
            Container.is_deleted == False,  # noqa: E712
        )
    )
    container = result.scalar_one_or_none()
    if not container:
        raise HTTPException(status_code=404, detail="Container not found")
    return container


def _doc_to_out(doc: ShipmentDocument) -> DocumentOut:
    return DocumentOut(
        id=doc.id,
        container_id=doc.container_id,
        doc_type=doc.doc_type,
        filename=doc.filename,
        file_size=doc.file_size,
        mime_type=doc.mime_type,
        notes=doc.notes,
        created_at=doc.created_at.isoformat(),
    )


# ── 1. List documents ────────────────────────────────────────

@router.get("/containers/{container_id}/documents")
async def list_documents(
    container_id: str,
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_onboarded),
) -> list[DocumentOut]:
    await _get_container(db, container_id)
    result = await db.execute(
        select(ShipmentDocument)
        .where(ShipmentDocument.container_id == container_id)
        .order_by(ShipmentDocument.created_at.desc())
    )
    return [_doc_to_out(d) for d in result.scalars().all()]


# ── 2. Upload document ───────────────────────────────────────

@router.post("/containers/{container_id}/documents/upload")
async def upload_document(
    container_id: str,
    doc_type: str = "other",
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_tenant_db),
    user: User = Depends(require_permission("batch.write")),
) -> DocumentOut:
    container = await _get_container(db, container_id)

    file_bytes = await file.read()
    filename = file.filename or "document"
    content_type = file.content_type or "application/octet-stream"

    # Determine tenant schema from the DB session
    tenant_schema = (await db.execute(select(Container.id).limit(0))).context.compiled_state  # noqa
    # Simpler: use container_id as namespace
    s3_key = _s3_key("documents", container_id, filename)

    upload_file(s3_key, file_bytes, content_type)

    doc = ShipmentDocument(
        container_id=container.id,
        doc_type=doc_type,
        filename=filename,
        s3_key=s3_key,
        file_size=len(file_bytes),
        mime_type=content_type,
        uploaded_by=user.id,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return _doc_to_out(doc)


# ── 3. Generate packing list PDF ─────────────────────────────

@router.post("/containers/{container_id}/documents/generate-packing-list")
async def generate_packing_list_doc(
    container_id: str,
    body: GeneratePackingListRequest,
    db: AsyncSession = Depends(get_tenant_db),
    user: User = Depends(require_permission("batch.write")),
) -> DocumentOut:
    container = await _get_container(db, container_id)

    # Import and call the packing list data function from reports
    from app.routers.reports import packing_list as _pl_handler
    # We need to call the actual data logic, not the endpoint handler
    # So we replicate the core query inline using the existing endpoint
    from app.routers.reports import PackingListResponse
    from sqlalchemy.orm import selectinload
    from app.models.tenant.pallet import Pallet, PalletLot
    from app.models.tenant.lot import Lot
    from app.models.tenant.grower import Grower
    from app.models.tenant.product_config import BoxSize, PalletType

    stmt = (
        select(Container)
        .where(Container.id == container_id, Container.is_deleted == False)  # noqa: E712
        .options(
            selectinload(Container.pallets)
            .selectinload(Pallet.pallet_lots)
            .selectinload(PalletLot.lot)
            .selectinload(Lot.batch),
        )
    )
    result = await db.execute(stmt)
    cont = result.scalar_one_or_none()
    if not cont:
        raise HTTPException(status_code=404, detail="Container not found")

    # Build grower lookup
    grower_ids = set()
    for p in cont.pallets:
        for pl in (p.pallet_lots or []):
            if pl.lot and pl.lot.grower_id:
                grower_ids.add(pl.lot.grower_id)

    grower_map: dict[str, tuple[str, str | None, str | None]] = {}
    if grower_ids:
        g_result = await db.execute(
            select(Grower.id, Grower.name, Grower.grower_code, Grower.globalg_ap_number)
            .where(Grower.id.in_(grower_ids))
        )
        for gid, gname, gcode, gggn in g_result.all():
            grower_map[gid] = (gname, gcode, gggn)

    # Box size weights and tare weights
    box_size_weights: dict[str, float] = {}
    box_size_tare: dict[str, float] = {}
    bs_ids = {p.box_size_id for p in cont.pallets if p.box_size_id and not p.is_deleted}
    if bs_ids:
        bs_result = await db.execute(
            select(BoxSize.id, BoxSize.weight_kg, BoxSize.tare_weight_kg)
            .where(BoxSize.id.in_(bs_ids))
        )
        for bsid, bsw, bst in bs_result.all():
            box_size_weights[bsid] = bsw
            box_size_tare[bsid] = bst or 0.0

    # Pallet type tare weights (wood pallet weight)
    pallet_type_tare: dict[str, float] = {}
    pt_names = {p.pallet_type_name for p in cont.pallets if p.pallet_type_name and not p.is_deleted}
    if pt_names:
        pt_result = await db.execute(
            select(PalletType.name, PalletType.tare_weight_kg)
            .where(PalletType.name.in_(pt_names))
        )
        for ptname, pttare in pt_result.all():
            pallet_type_tare[ptname] = pttare or 0.0

    # Build response data as dict for PDF generator
    pallets_out = []
    total_cartons = 0
    total_net = 0.0
    total_gross = 0.0

    for p in sorted(cont.pallets, key=lambda x: x.pallet_number):
        if p.is_deleted:
            continue
        lots_out = []
        lot_weight_sum = 0.0
        for pl in (p.pallet_lots or []):
            if pl.is_deleted or not pl.lot:
                continue
            lot = pl.lot
            gname, gcode, gggn = grower_map.get(lot.grower_id, ("Unknown", None, None))
            lot_wt = None
            if lot.weight_kg and lot.carton_count and lot.carton_count > 0:
                lot_wt = round(lot.weight_kg / lot.carton_count * pl.box_count, 2)
            lot_weight_sum += lot_wt or 0
            lots_out.append({
                "lot_code": lot.lot_code,
                "grower_name": gname,
                "grower_code": gcode,
                "grower_ggn": gggn,
                "batch_code": lot.batch.batch_code if lot.batch else "",
                "harvest_date": lot.batch.harvest_date.isoformat() if lot.batch and lot.batch.harvest_date else None,
                "carton_count": pl.box_count,
                "weight_kg": lot_wt,
            })

        # Net weight = fruit weight only
        net_wt = p.net_weight_kg
        if net_wt is None and lot_weight_sum > 0:
            net_wt = round(lot_weight_sum, 2)
        elif net_wt is None and p.box_size_id and p.box_size_id in box_size_weights:
            net_wt = round(box_size_weights[p.box_size_id] * p.current_boxes, 2)

        # Gross weight = net + box tare per carton + pallet wood tare
        gross_wt = p.gross_weight_kg
        if gross_wt is None and net_wt is not None:
            box_tare_total = box_size_tare.get(p.box_size_id, 0.0) * p.current_boxes if p.box_size_id else 0.0
            pallet_wood_tare = pallet_type_tare.get(p.pallet_type_name, 0.0) if p.pallet_type_name else 0.0
            gross_wt = round(net_wt + box_tare_total + pallet_wood_tare, 2)

        pallets_out.append({
            "pallet_number": p.pallet_number,
            "position": p.position_in_container,
            "fruit_type": p.fruit_type,
            "variety": p.variety,
            "grade": p.grade,
            "size": p.size,
            "box_size": p.box_size_name,
            "boxes": p.current_boxes,
            "net_weight_kg": net_wt,
            "gross_weight_kg": gross_wt,
            "lots": lots_out,
        })
        total_cartons += p.current_boxes
        total_net += net_wt or 0
        total_gross += gross_wt or 0

    pdf_data = {
        "container_number": cont.container_number,
        "container_type": cont.container_type,
        "shipping_container_number": cont.shipping_container_number,
        "customer_name": cont.customer_name,
        "destination": cont.destination,
        "seal_number": cont.seal_number,
        "vessel_name": cont.vessel_name,
        "voyage_number": cont.voyage_number,
        "export_date": cont.export_date.isoformat() if cont.export_date else None,
        "etd": cont.etd.isoformat() if cont.etd else None,
        "eta": cont.eta.isoformat() if cont.eta else None,
        "transporter_name": cont.transporter.name if cont.transporter else None,
        "shipping_agent_name": cont.shipping_agent.name if cont.shipping_agent else None,
        "pallet_count": len(pallets_out),
        "total_cartons": total_cartons,
        "total_net_weight_kg": round(total_net, 1),
        "total_gross_weight_kg": round(total_gross, 1),
        "pallets": pallets_out,
    }

    # Generate PDF
    if body.variant == "traceability":
        pdf_bytes = generate_traceability_pdf(pdf_data)
        filename = f"packing_list_traceability_{cont.container_number}.pdf"
        doc_type = "packing_list_traceability"
    else:
        pdf_bytes = generate_shipping_pdf(pdf_data)
        filename = f"packing_list_shipping_{cont.container_number}.pdf"
        doc_type = "packing_list_shipping"

    # Upload to S3
    s3_key = _s3_key("documents", container_id, filename)
    upload_file(s3_key, pdf_bytes, "application/pdf")

    # Remove any previous packing list of same type
    prev = await db.execute(
        select(ShipmentDocument).where(
            ShipmentDocument.container_id == container_id,
            ShipmentDocument.doc_type == doc_type,
        )
    )
    for old_doc in prev.scalars().all():
        try:
            delete_file(old_doc.s3_key)
        except Exception:
            pass
        await db.delete(old_doc)

    # Save new doc record
    doc = ShipmentDocument(
        container_id=container.id,
        doc_type=doc_type,
        filename=filename,
        s3_key=s3_key,
        file_size=len(pdf_bytes),
        mime_type="application/pdf",
        uploaded_by=user.id,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return _doc_to_out(doc)


# ── 4. Download document ──────────────────────────────────────

@router.get("/containers/{container_id}/documents/{doc_id}/download")
async def download_document_endpoint(
    container_id: str,
    doc_id: str,
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_onboarded),
):
    result = await db.execute(
        select(ShipmentDocument).where(
            ShipmentDocument.id == doc_id,
            ShipmentDocument.container_id == container_id,
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if _use_s3():
        url = generate_presigned_url(doc.s3_key)
        return {"url": url, "filename": doc.filename}
    else:
        # Serve the file directly from local storage
        file_bytes = download_file(doc.s3_key)
        return Response(
            content=file_bytes,
            media_type=doc.mime_type,
            headers={
                "Content-Disposition": f'attachment; filename="{doc.filename}"',
            },
        )


# ── 5. Delete document ───────────────────────────────────────

@router.delete("/containers/{container_id}/documents/{doc_id}")
async def delete_document(
    container_id: str,
    doc_id: str,
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_permission("batch.write")),
):
    result = await db.execute(
        select(ShipmentDocument).where(
            ShipmentDocument.id == doc_id,
            ShipmentDocument.container_id == container_id,
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    try:
        delete_file(doc.s3_key)
    except Exception:
        pass  # S3 deletion failure shouldn't block DB cleanup

    await db.delete(doc)
    await db.commit()
    return {"ok": True}


# ── 6. Email documents ───────────────────────────────────────

@router.post("/containers/{container_id}/documents/email")
async def email_documents(
    container_id: str,
    body: EmailDocumentsRequest,
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_permission("batch.write")),
):
    container = await _get_container(db, container_id)

    # Determine recipient email
    to_email = body.to_email
    if not to_email and container.client_id:
        client_result = await db.execute(
            select(Client).where(Client.id == container.client_id)
        )
        client = client_result.scalar_one_or_none()
        if client and client.email:
            to_email = client.email

    if not to_email:
        raise HTTPException(
            status_code=400,
            detail="No recipient email — set client email or provide to_email",
        )

    # Fetch all documents
    docs_result = await db.execute(
        select(ShipmentDocument)
        .where(ShipmentDocument.container_id == container_id)
        .order_by(ShipmentDocument.created_at)
    )
    docs = docs_result.scalars().all()
    if not docs:
        raise HTTPException(status_code=400, detail="No documents to send")

    # Download all files from S3
    attachments = []
    for doc in docs:
        try:
            file_bytes = download_file(doc.s3_key)
            attachments.append((doc.filename, file_bytes, doc.mime_type))
        except Exception:
            pass  # Skip files that can't be downloaded

    if not attachments:
        raise HTTPException(status_code=500, detail="Failed to download documents from storage")

    # Build email
    subject = body.subject or f"Shipment Documents — Container {container.container_number}"
    customer = container.customer_name or "Customer"
    message_body = body.message or ""

    html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px;">
        <h2 style="color: #227843;">Shipment Documents</h2>
        <p>Dear {customer},</p>
        <p>Please find attached the shipment documents for container
           <strong>{container.container_number}</strong>.</p>
        {f'<p>{message_body}</p>' if message_body else ''}
        <table style="width:100%; border-collapse:collapse; margin: 16px 0;">
            <tr style="background:#f5f5f5;">
                <td style="padding:8px; font-weight:bold;">Container</td>
                <td style="padding:8px;">{container.container_number}</td>
            </tr>
            <tr>
                <td style="padding:8px; font-weight:bold;">Destination</td>
                <td style="padding:8px;">{container.destination or '—'}</td>
            </tr>
            <tr style="background:#f5f5f5;">
                <td style="padding:8px; font-weight:bold;">Vessel</td>
                <td style="padding:8px;">{container.vessel_name or '—'}</td>
            </tr>
            <tr>
                <td style="padding:8px; font-weight:bold;">Documents</td>
                <td style="padding:8px;">{len(attachments)} file(s) attached</td>
            </tr>
        </table>
        <p style="color:#888; font-size:12px;">
            Sent via FruitPAK — Packhouse Management System
        </p>
    </div>
    """

    success = send_email(to_email, subject, html, attachments)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to send email")

    return {
        "ok": True,
        "to": to_email,
        "documents_sent": len(attachments),
    }
