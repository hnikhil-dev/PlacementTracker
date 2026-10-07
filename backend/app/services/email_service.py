import logging
import smtplib
from email.mime.text import MIMEText
from app.config import EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS

logger = logging.getLogger("placement-tracker.email")

def send_reset_email(to_email: str, reset_link: str) -> bool:
    if not EMAIL_USER or not EMAIL_PASS:
        logger.warning("EMAIL_USER or EMAIL_PASS not configured. Skipping email dispatch to %s.", to_email)
        return False
    
    subject = "Password Reset - Smart Student Placement Manager"
    body = (
        f"Hello,\n\n"
        f"Click the link below to reset your password. The link expires in 1 hour:\n\n"
        f"{reset_link}\n\n"
        f"If you did not request this, please ignore this email.\n"
    )

    msg = MIMEText(body, "plain", "utf-8")
    msg["Subject"] = subject
    msg["From"] = EMAIL_USER
    msg["To"] = to_email

    try:
        logger.info("Sending password reset email to %s via %s:%s...", to_email, EMAIL_HOST, EMAIL_PORT)
        with smtplib.SMTP(EMAIL_HOST, EMAIL_PORT, timeout=10) as server:
            server.starttls()
            server.login(EMAIL_USER, EMAIL_PASS)
            server.sendmail(EMAIL_USER, [to_email], msg.as_string())
        logger.info("Password reset email successfully sent to %s.", to_email)
        return True
    except Exception as e:
        logger.error("Failed to send password reset email to %s: %s", to_email, e)
        return False
