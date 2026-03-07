"""Server-side packing list PDF generation using ReportLab.

Generates A4 portrait PDFs for:
- Shipping packing list (compact pallet table)
- Traceability packing list (grower/lot detail per pallet)
"""

import io
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer,
)


GREEN = colors.HexColor("#227843")
LIGHT_GREEN = colors.HexColor("#f0f5f0")
GRAY = colors.HexColor("#666666")
WHITE = colors.white

WIDTH, HEIGHT = A4
MARGIN = 14 * mm


def _fmt(val, fallback="—"):
    return str(val) if val is not None else fallback


def _fmt_container_type(raw: str | None) -> str:
    """Format container type for display: 'reefer_40ft' → 'Reefer 40ft'."""
    if not raw:
        return "—"
    return raw.replace("_", " ").title()


def _header_table(data: dict) -> Table:
    """Build a 4-column container details table."""
    etd = data.get("etd")
    eta = data.get("eta")
    rows = [
        ["Container", _fmt(data.get("container_number")),
         "Type", _fmt_container_type(data.get("container_type"))],
        ["Shipping #", _fmt(data.get("shipping_container_number")),
         "Seal #", _fmt(data.get("seal_number"))],
        ["Customer", _fmt(data.get("customer_name")),
         "Destination", _fmt(data.get("destination"))],
        ["Vessel", _fmt(data.get("vessel_name")),
         "Voyage", _fmt(data.get("voyage_number"))],
        ["ETD (Origin)", _fmt(etd[:10] if etd else None),
         "ETA (Dest.)", _fmt(eta[:10] if eta else None)],
        ["Transporter", _fmt(data.get("transporter_name")),
         "Shipping Agent", _fmt(data.get("shipping_agent_name"))],
        ["Export Date", _fmt(data.get("export_date", "")[:10] if data.get("export_date") else None),
         "", ""],
    ]
    t = Table(rows, colWidths=[22 * mm, 55 * mm, 22 * mm, 55 * mm])
    t.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
        ("TEXTCOLOR", (0, 0), (0, -1), GRAY),
        ("TEXTCOLOR", (2, 0), (2, -1), GRAY),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
    ]))
    return t


def _totals_row(data: dict) -> Table:
    """Build a summary bar."""
    total_net = data.get("total_net_weight_kg", 0)
    total_gross = data.get("total_gross_weight_kg", 0)
    rows = [[
        f"Pallets: {data.get('pallet_count', 0)}",
        f"Cartons: {data.get('total_cartons', 0)}",
        f"Net: {total_net:,.1f} kg",
        f"Gross: {total_gross:,.1f} kg",
    ]]
    t = Table(rows, colWidths=[(WIDTH - 2 * MARGIN) / 4] * 4)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), LIGHT_GREEN),
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("TEXTCOLOR", (0, 0), (-1, -1), GREEN),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ]))
    return t


def generate_shipping_pdf(data: dict) -> bytes:
    """Generate a shipping packing list PDF (compact pallet table)."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=MARGIN, rightMargin=MARGIN,
        topMargin=MARGIN, bottomMargin=MARGIN,
    )
    styles = getSampleStyleSheet()
    elements = []

    # Title
    title_style = styles["Title"].clone("pdfTitle")
    title_style.fontSize = 14
    title_style.textColor = GREEN
    title_style.alignment = 0
    elements.append(Paragraph("PACKING LIST — SHIPPING", title_style))
    elements.append(Spacer(1, 4 * mm))

    # Header
    elements.append(_header_table(data))
    elements.append(Spacer(1, 3 * mm))
    elements.append(_totals_row(data))
    elements.append(Spacer(1, 4 * mm))

    # Table
    headers = ["#", "Pallet #", "Fruit", "Variety", "Grade", "Size",
               "Box Size", "Boxes", "Net (kg)", "Gross (kg)"]
    table_data = [headers]

    pallets = data.get("pallets", [])
    for i, p in enumerate(pallets):
        net = p.get("net_weight_kg")
        gross = p.get("gross_weight_kg")
        table_data.append([
            i + 1,
            p.get("pallet_number", ""),
            _fmt(p.get("fruit_type")),
            _fmt(p.get("variety")),
            _fmt(p.get("grade")),
            _fmt(p.get("size")),
            _fmt(p.get("box_size")),
            p.get("boxes", 0),
            f"{net:,.1f}" if net is not None else "—",
            f"{gross:,.1f}" if gross is not None else "—",
        ])

    # Totals row
    total_net = data.get("total_net_weight_kg", 0)
    total_gross = data.get("total_gross_weight_kg", 0)
    table_data.append([
        "", f"Totals ({data.get('pallet_count', 0)} pallets)",
        "", "", "", "", "",
        data.get("total_cartons", 0),
        f"{total_net:,.1f}",
        f"{total_gross:,.1f}",
    ])

    # #:8, Pallet#:26, Fruit:14, Variety:14, Grade:10, Size:10, BoxSize:25, Boxes:13, Net:18, Gross:18
    col_widths = [8 * mm, 26 * mm, 14 * mm, 14 * mm, 10 * mm, 10 * mm,
                  25 * mm, 13 * mm, 18 * mm, 18 * mm]

    t = Table(table_data, colWidths=col_widths, repeatRows=1)
    t.setStyle(TableStyle([
        # Header
        ("BACKGROUND", (0, 0), (-1, 0), GREEN),
        ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 7),
        # Body
        ("FONTSIZE", (0, 1), (-1, -1), 7),
        ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
        # Grid
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("ROWBACKGROUNDS", (0, 1), (-1, -2), [WHITE, colors.HexColor("#f9f9f9")]),
        # Right-align numeric cols
        ("ALIGN", (0, 0), (0, -1), "CENTER"),
        ("ALIGN", (7, 0), (-1, -1), "RIGHT"),
        # Totals row
        ("BACKGROUND", (0, -1), (-1, -1), LIGHT_GREEN),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        # Padding
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("LEFTPADDING", (0, 0), (-1, -1), 3),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3),
    ]))
    elements.append(t)

    # Footer with generation timestamp
    elements.append(Spacer(1, 6 * mm))
    footer_style = styles["Normal"].clone("footer")
    footer_style.fontSize = 7
    footer_style.textColor = GRAY
    elements.append(Paragraph(
        f"Generated: {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}",
        footer_style,
    ))

    doc.build(elements)
    return buf.getvalue()


def generate_traceability_pdf(data: dict) -> bytes:
    """Generate a traceability packing list PDF (grower/lot detail per pallet)."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=MARGIN, rightMargin=MARGIN,
        topMargin=MARGIN, bottomMargin=MARGIN,
    )
    styles = getSampleStyleSheet()
    elements = []

    # Title
    title_style = styles["Title"].clone("pdfTitle2")
    title_style.fontSize = 14
    title_style.textColor = GREEN
    title_style.alignment = 0
    elements.append(Paragraph("PACKING LIST — TRACEABILITY", title_style))
    elements.append(Spacer(1, 4 * mm))

    # Header
    elements.append(_header_table(data))
    elements.append(Spacer(1, 3 * mm))
    elements.append(_totals_row(data))
    elements.append(Spacer(1, 4 * mm))

    # Table
    headers = ["Pallet #", "Fruit", "Grade", "Size", "Lot", "Grower",
               "GGN", "Batch", "Harvest", "Ctns", "Wt (kg)"]
    table_data = [headers]

    pallets = data.get("pallets", [])
    for p in pallets:
        lots = p.get("lots", [])
        if not lots:
            table_data.append([
                p.get("pallet_number", ""),
                _fmt(p.get("fruit_type")),
                _fmt(p.get("grade")),
                _fmt(p.get("size")),
                "—", "—", "—", "—", "—", "—", "—",
            ])
        else:
            for i, lot in enumerate(lots):
                row = []
                if i == 0:
                    row.extend([
                        p.get("pallet_number", ""),
                        _fmt(p.get("fruit_type")),
                        _fmt(p.get("grade")),
                        _fmt(p.get("size")),
                    ])
                else:
                    row.extend(["", "", "", ""])
                grower = lot.get("grower_name", "")
                if lot.get("grower_code"):
                    grower += f" ({lot['grower_code']})"
                row.extend([
                    lot.get("lot_code", ""),
                    grower,
                    _fmt(lot.get("grower_ggn")),
                    lot.get("batch_code", ""),
                    _fmt(lot.get("harvest_date", "")[:10] if lot.get("harvest_date") else None),
                    lot.get("carton_count", 0),
                    _fmt(lot.get("weight_kg")),
                ])
                table_data.append(row)

    # Totals row
    table_data.append([
        f"Totals ({data.get('pallet_count', 0)} pallets)",
        "", "", "", "", "", "", "", "",
        data.get("total_cartons", 0),
        f"{data.get('total_gross_weight_kg', 0):,.1f}",
    ])

    col_widths = [20 * mm, 14 * mm, 12 * mm, 12 * mm, 16 * mm, 22 * mm,
                  18 * mm, 16 * mm, 16 * mm, 12 * mm, 14 * mm]

    t = Table(table_data, colWidths=col_widths, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), GREEN),
        ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 6.5),
        ("FONTSIZE", (0, 1), (-1, -1), 6.5),
        ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("ROWBACKGROUNDS", (0, 1), (-1, -2), [WHITE, colors.HexColor("#f9f9f9")]),
        ("ALIGN", (9, 0), (-1, -1), "RIGHT"),
        ("BACKGROUND", (0, -1), (-1, -1), LIGHT_GREEN),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("LEFTPADDING", (0, 0), (-1, -1), 2),
        ("RIGHTPADDING", (0, 0), (-1, -1), 2),
    ]))
    elements.append(t)

    elements.append(Spacer(1, 6 * mm))
    footer_style = styles["Normal"].clone("footer2")
    footer_style.fontSize = 7
    footer_style.textColor = GRAY
    elements.append(Paragraph(
        f"Generated: {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}",
        footer_style,
    ))

    doc.build(elements)
    return buf.getvalue()
