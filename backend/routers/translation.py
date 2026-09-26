import os

import google.generativeai as genai
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(tags=["Translation"])


class TranslateRequest(BaseModel):
    text: str
    target_lang: str


LANGUAGE_NAMES = {
    "hi": "Hindi",
    "mr": "Marathi",
    "kn": "Kannada",
    "te": "Telugu",
    "ta": "Tamil",
    "bn": "Bengali",
    "en": "English",
}


def translate_text(text: str, target_lang: str) -> str:
    if not text or target_lang == "en":
        return text

    api_key = os.getenv("GOOGLE_API_KEY", "")
    if not api_key:
        return text

    try:
        genai.configure(api_key=api_key.split(",")[0].strip())
        model = genai.GenerativeModel("gemini-2.5-flash")
        language_name = LANGUAGE_NAMES.get(target_lang, target_lang)
        response = model.generate_content(
            f"Translate the following healthcare application text to {language_name}. "
            "Preserve numbers, units, medical meaning, and formatting. Return only the translation.\n\n"
            f"{text}"
        )
        return response.text.strip() if response.text else text
    except Exception as exc:
        print(f"Translation failed: {exc}")
        return text


@router.post("/translate")
async def translate_text_endpoint(payload: TranslateRequest):
    return {
        "translated_text": translate_text(payload.text, payload.target_lang)
    }
