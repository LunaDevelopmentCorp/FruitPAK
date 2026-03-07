"""Email sending utility using SendGrid.

Sends emails with optional file attachments for shipment document dispatch.
"""

import base64
import logging

from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import (
    Attachment,
    ContentId,
    Disposition,
    FileContent,
    FileName,
    FileType,
    Mail,
)

from app.config import settings

log = logging.getLogger(__name__)


def send_email(
    to: str,
    subject: str,
    html_body: str,
    attachments: list[tuple[str, bytes, str]] | None = None,
) -> bool:
    """Send an email via SendGrid.

    Args:
        to: Recipient email address.
        subject: Email subject line.
        html_body: HTML body content.
        attachments: List of (filename, file_bytes, mime_type) tuples.

    Returns:
        True if sent successfully, False otherwise.
    """
    if not settings.sendgrid_api_key:
        log.error("SENDGRID_API_KEY is not configured — cannot send email")
        return False

    message = Mail(
        from_email=(settings.email_from_address, settings.email_from_name),
        to_emails=to,
        subject=subject,
        html_content=html_body,
    )

    if attachments:
        for filename, file_bytes, mime_type in attachments:
            attachment = Attachment(
                FileContent(base64.b64encode(file_bytes).decode()),
                FileName(filename),
                FileType(mime_type),
                Disposition("attachment"),
            )
            message.add_attachment(attachment)

    try:
        sg = SendGridAPIClient(settings.sendgrid_api_key)
        response = sg.send(message)
        log.info(
            "Email sent to %s — status %s, subject: %s",
            to, response.status_code, subject,
        )
        return response.status_code in (200, 201, 202)
    except Exception:
        log.exception("Failed to send email to %s", to)
        return False
