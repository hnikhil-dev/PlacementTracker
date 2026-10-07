import logging
import requests
from app.config import SUPABASE_URL, SUPABASE_KEY, SUPABASE_BUCKET

logger = logging.getLogger("placement-tracker.storage")

def upload_resume_pdf(file_name: str, file_bytes: bytes) -> str:
    """
    Uploads raw PDF bytes to Supabase Storage.
    Returns the public download URL.
    """
    upload_url = f"{SUPABASE_URL}/storage/v1/object/{SUPABASE_BUCKET}/{file_name}"
    headers = {
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "apikey": SUPABASE_KEY,
        "Content-Type": "application/pdf"
    }

    logger.info("Uploading resume to Supabase bucket '%s': %s", SUPABASE_BUCKET, file_name)

    try:
        response = requests.post(upload_url, headers=headers, data=file_bytes, timeout=15)
        if response.status_code == 409 or "The resource already exists" in response.text:
            logger.info("File path conflict, attempting overwrite via PUT...")
            put_response = requests.put(upload_url, headers=headers, data=file_bytes, timeout=15)
            if put_response.status_code not in (200, 201):
                logger.error("Supabase PUT fallback failed: %s - %s", put_response.status_code, put_response.text)
                raise RuntimeError(f"Failed to overwrite resume: {put_response.text}")
        elif response.status_code not in (200, 201):
            logger.error("Supabase upload returned error: %s - %s", response.status_code, response.text)
            raise RuntimeError(f"Failed to upload resume: {response.text}")
    except Exception as e:
        logger.error("Supabase upload failed: %s", e)
        raise e

    public_url = f"{SUPABASE_URL}/storage/v1/object/public/{SUPABASE_BUCKET}/{file_name}"
    logger.info("Resume successfully uploaded. Public URL: %s", public_url)
    return public_url
