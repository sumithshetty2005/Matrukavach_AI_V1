"use client";

import React, { useState, useEffect } from "react";
import QRCode from "qrcode";
import { API_BASE_URL } from "@/lib/api";
import { Card } from "./ui/Card";
import { Button } from "./ui/Button";
import { Copy, Check, QrCode, ShieldCheck, Clock } from "lucide-react";
import { useLanguage } from "@/components/LanguageContext";

interface PatientQRCodeProps {
  motherId: string;
  patientName: string;
}

export function PatientQRCode({ motherId, patientName }: PatientQRCodeProps) {
  const { language } = useLanguage();
  const secureShareDescriptions = {
    en: "Scan to view {name}'s secure health history and consultation records on any portal.",
    hi: "किसी भी पोर्टल पर {name} का सुरक्षित स्वास्थ्य इतिहास और परामर्श रिकॉर्ड देखने के लिए स्कैन करें।",
    mr: "कोणत्याही पोर्टलवर {name} यांचा सुरक्षित आरोग्य इतिहास आणि सल्लामसलत नोंदी पाहण्यासाठी स्कॅन करा.",
    kn: "ಯಾವುದೇ ಪೋರ್ಟಲ್‌ನಲ್ಲಿ {name} ಅವರ ಸುರಕ್ಷಿತ ಆರೋಗ್ಯ ಇತಿಹಾಸ ಮತ್ತು ಸಮಾಲೋಚನಾ ದಾಖಲೆಗಳನ್ನು ವೀಕ್ಷಿಸಲು ಸ್ಕ್ಯಾನ್ ಮಾಡಿ.",
    te: "ఏదైనా పోర్టల్‌లో {name} యొక్క సురక్షిత ఆరోగ్య చరిత్ర మరియు సంప్రదింపు రికార్డులను చూడటానికి స్కాన్ చేయండి.",
    ta: "எந்த போர்ட்டலிலும் {name} அவர்களின் பாதுகாப்பான சுகாதார வரலாறு மற்றும் ஆலோசனைப் பதிவுகளைப் பார்க்க ஸ்கேன் செய்யவும்.",
    bn: "যেকোনো পোর্টালে {name}-এর নিরাপদ স্বাস্থ্য ইতিহাস এবং পরামর্শের রেকর্ড দেখতে স্ক্যান করুন।",
  } as const;
  const secureShareDescription = secureShareDescriptions[language].replace("{name}", patientName);
  const [qrUrl, setQrUrl] = useState<string>("");
  const [shareLink, setShareLink] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [hasGenerated, setHasGenerated] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [translatedText, setTranslatedText] = useState({
    patientName,
    title: "Secure QR Record Share",
    description: `Scan to view ${patientName}'s secure health history and consultation records on any portal.`,
    generating: "Generating Secure Code...",
    error: "Could not generate secure QR code",
    generate: "Generate QR",
    expires: "Expires in 24 Hours (Secured by JWT)",
    copied: "Copied!",
    copyLink: "Copy Link",
  });

  useEffect(() => {
    let cancelled = false;
    const sourceText = [
      patientName,
      "Secure QR Record Share",
      secureShareDescription,
      "Generating Secure Code...",
      "Could not generate secure QR code",
      "Generate QR",
      "Expires in 24 Hours (Secured by JWT)",
      "Copied!",
      "Copy Link",
    ];

    if (language === "en") {
      setTranslatedText({
        patientName,
        title: sourceText[1],
        description: secureShareDescription,
        generating: sourceText[3],
        error: sourceText[4],
        generate: sourceText[5],
        expires: sourceText[6],
        copied: sourceText[7],
        copyLink: sourceText[8],
      });
      return () => {
        cancelled = true;
      };
    }

    const translate = async (text: string) => {
      try {
        const response = await fetch(`${API_BASE_URL}/translate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, target_lang: language }),
        });
        if (!response.ok) return text;
        const data = await response.json();
        return data.translated_text || text;
      } catch {
        return text;
      }
    };

    Promise.all(sourceText.map(translate)).then((translated) => {
      if (cancelled) return;
      setTranslatedText({
        patientName: translated[0],
        title: translated[1],
        description: secureShareDescription,
        generating: translated[3],
        error: translated[4],
        generate: translated[5],
        expires: translated[6],
        copied: translated[7],
        copyLink: translated[8],
      });
    });

    return () => {
      cancelled = true;
    };
  }, [language, patientName, secureShareDescription]);

  const fetchTokenAndGenerateQR = async () => {
    try {
      setLoading(true);
      setError("");
      // 1. Fetch secure cryptographically signed share token from backend
      const res = await fetch(`${API_BASE_URL}/share/mother/${motherId}/token`);
      if (!res.ok) {
        throw new Error("Failed to generate security token");
      }
      const data = await res.json();
      
      // 2. Build the secure client-side redirect destination URL
      const secureUrl = `${window.location.origin}/share/mother/${motherId}?token=${data.token}`;
      setShareLink(secureUrl);

      // 3. Generate QR code Data URL using the 'qrcode' library
      const qrDataUrl = await QRCode.toDataURL(secureUrl, {
        width: 250,
        margin: 2,
        color: {
          dark: "#1e293b", // Slate 800
          light: "#ffffff",
        },
      });
      setQrUrl(qrDataUrl);
      setHasGenerated(true);
    } catch (err: unknown) {
      console.error("QR Generation error:", err);
      setError(translatedText.error);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy link:", err);
    }
  };

  return (
    <Card variant="glass" className="p-6 border border-gray-150 shadow-sm bg-white rounded-2xl flex flex-col items-center text-center max-w-sm mx-auto">
      <div className="flex items-center gap-2 mb-4">
        <ShieldCheck className="w-5 h-5 text-green-600" />
        <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider">
          {translatedText.title}
        </h3>
      </div>

      <p className="text-xs text-gray-500 mb-6">
        {translatedText.description}
      </p>

      <div className="relative w-48 h-48 bg-gray-50 rounded-xl border border-gray-100 flex items-center justify-center shadow-inner mb-6 overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center gap-2">
            <QrCode className="w-8 h-8 text-gray-300 animate-pulse" />
            <span className="text-[10px] text-gray-400 font-semibold animate-pulse">{translatedText.generating}</span>
          </div>
        ) : error ? (
          <p className="text-xs text-red-500 font-medium px-4">{error}</p>
        ) : !hasGenerated ? (
          <div className="flex flex-col items-center gap-3 p-4">
            <QrCode className="w-12 h-12 text-gray-300" />
            <Button size="sm" onClick={fetchTokenAndGenerateQR} className="text-xs py-1.5 px-4 font-bold shadow-md">
              {translatedText.generate}
            </Button>
          </div>
        ) : (
          <img src={qrUrl} alt="Patient Secure QR Code" className="w-full h-full object-contain" />
        )}
      </div>

      <div className="w-full space-y-3">
        <div className="flex items-center justify-center gap-1.5 text-[10px] text-gray-400 font-medium bg-gray-50 py-1.5 px-3 rounded-full border border-gray-100 w-fit mx-auto">
          <Clock className="w-3.5 h-3.5 text-gray-400" />
          <span>{translatedText.expires}</span>
        </div>

        {hasGenerated && !loading && !error && (
          <div className="flex gap-2 pt-2">
            <Button
              variant="secondary"
              onClick={handleCopyLink}
              className="flex-1 py-2 text-xs font-bold rounded-lg border border-gray-250 hover:bg-gray-50 flex items-center justify-center gap-1.5 transition-all"
            >
                {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-green-600" /> {translatedText.copied}
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" /> {translatedText.copyLink}
                </>
              )}
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
