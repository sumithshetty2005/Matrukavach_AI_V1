"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { MapPin, User, MessageCircle, FileText, Activity, Plus, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { API_BASE_URL } from "@/lib/api";
import { useLanguage } from "@/components/LanguageContext";
import { PatientQRCode } from "@/components/PatientQRCode";

export default function MotherDetailPage() {
    const params = useParams();
    const motherId = params.id as string;
    const { t, language } = useLanguage();

    const [activeTab, setActiveTab] = useState("assessments");
    const [mother, setMother] = useState<any>(null);
    const [history, setHistory] = useState<any[]>([]);
    const [documents, setDocuments] = useState<any[]>([]);
    const [translatedHistory, setTranslatedHistory] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);

    const parseValue = (value: unknown, fallback: unknown) => {
        if (typeof value !== "string") return value ?? fallback;
        try {
            return JSON.parse(value);
        } catch {
            return fallback;
        }
    };

    const toStringList = (value: unknown): string[] => {
        const parsed = parseValue(value, []);
        return Array.isArray(parsed) ? parsed.map(String) : [];
    };

    const normalizeNutrition = (value: unknown) => {
        const parsed = parseValue(value, {});
        if (Array.isArray(parsed)) return parsed.map(String);
        if (parsed && typeof parsed === "object") {
            return Object.fromEntries(
                Object.entries(parsed).map(([category, advice]) => [
                    category,
                    Array.isArray(advice) ? advice.map(String) : []
                ])
            );
        }
        return {};
    };

    useEffect(() => {
        async function fetchData() {
            try {
                
                const motherRes = await fetch(`${API_BASE_URL}/mother/${motherId}`);
                if (motherRes.ok) setMother(await motherRes.json());

                const histRes = await fetch(`${API_BASE_URL}/mother/${motherId}/history`);
                if (histRes.ok) setHistory(await histRes.json());

                const docsRes = await fetch(`${API_BASE_URL}/mother/${motherId}/documents`);
                if (docsRes.ok) setDocuments(await docsRes.json());

            } catch (e) {
                console.error("Failed to fetch data", e);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, [motherId]);

    useEffect(() => {
        if (language === "en" || history.length === 0) {
            setTranslatedHistory(history);
            return;
        }

        let cancelled = false;
        const translate = async (text: string) => {
            if (!text) return text;
            try {
                const response = await fetch(`${API_BASE_URL}/translate`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ text, target_lang: language })
                });
                if (!response.ok) return text;
                const data = await response.json();
                return data.translated_text || text;
            } catch {
                return text;
            }
        };

        (async () => {
            const nextHistory = await Promise.all(history.map(async (record) => {
                const clinicalFlags = toStringList(record.risk.clinical_flags);
                const nutritionAdvice = normalizeNutrition(record.risk.nutrition_advice);
                const translatedNutrition = Array.isArray(nutritionAdvice)
                    ? await Promise.all(nutritionAdvice.map(translate))
                    : Object.fromEntries(await Promise.all(
                        Object.entries(nutritionAdvice).map(async ([category, advice]) => [
                            await translate(category),
                            await Promise.all((advice as string[]).map(translate))
                        ])
                    ));

                return {
                    ...record,
                    risk: {
                        ...record.risk,
                        clinical_flags: await Promise.all(clinicalFlags.map(translate)),
                        nutrition_advice: translatedNutrition,
                        asha_consultation_note: await translate(record.risk.asha_consultation_note || "")
                    }
                };
            }));

            if (!cancelled) setTranslatedHistory(nextHistory);
        })();

        return () => {
            cancelled = true;
        };
    }, [history, language]);

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        setUploading(true);
        const file = e.target.files[0];
        const formData = new FormData();
        formData.append("file", file);
        try {
            const res = await fetch(`${API_BASE_URL}/mother/${motherId}/upload`, {
                method: "POST",
                body: formData
            });
            if (res.ok) {
                const newDoc = await res.json();
                setDocuments(prev => [newDoc, ...prev]);
            } else {
                alert("Upload failed");
            }
        } catch (err) {
            console.error(err);
        } finally {
            setUploading(false);
        }
    };

    const handleDeleteAssessment = async (assessmentDataId: number) => {
        try {
            const res = await fetch(`${API_BASE_URL}/assessment/${assessmentDataId}`, {
                method: "DELETE"
            });
            if (res.ok) {
                setHistory(prev => prev.filter(record => record.vitals.id !== assessmentDataId));
            }
        } catch (e) {
            console.error("Error deleting assessment:", e);
        }
    };

    if (loading) return <div className="p-8 text-center text-gray-900">{t("mother.uploading").replace("Uploading...", t("asha.loadingProfiles"))}</div>;
    if (!mother) return <div className="p-8 text-center text-alert">{t("mother.patientNotFound")}</div>;

    const recordsToRender = (translatedHistory.length > 0 ? translatedHistory : history).map((record) => ({
        ...record,
        risk: {
            ...record.risk,
            clinical_flags: toStringList(record.risk.clinical_flags),
            nutrition_advice: normalizeNutrition(record.risk.nutrition_advice)
        }
    }));

    return (
        <div className="space-y-6 pb-20">
            <Card variant="solid" className="p-6 bg-white border-none shadow-sm">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div className="flex flex-col sm:flex-row items-center sm:items-start md:items-center gap-6 text-center sm:text-left">
                        <div className="w-20 h-20 shrink-0 rounded-full bg-gray-100 flex items-center justify-center text-gray-900 text-2xl font-bold">
                            {mother.name.charAt(0)}
                        </div>
                        <div>
                            <h1 className="text-3xl font-heading font-bold text-gray-900">{mother.name}</h1>
                            <div className="flex flex-col sm:flex-row items-center sm:items-start md:items-center gap-2 sm:gap-4 text-gray-500 mt-2">
                                <span className="flex items-center gap-1"><MapPin className="w-4 h-4" /> {mother.latitude.toFixed(3)}, {mother.longitude.toFixed(3)}</span>
                                <span className="flex items-center gap-1"><User className="w-4 h-4" /> {t("common.age")}: {mother.age}</span>
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center w-full md:w-auto">
                        <Link href={`/asha/assess?motherId=${motherId}`} className="w-full sm:w-auto">
                            <Button size="sm" className="w-full justify-center">
                                <Plus className="w-4 h-4 mr-2" /> {t("asha.newAssessment")}
                            </Button>
                        </Link>
                        <div className={`px-4 py-2 text-center rounded-xl text-sm font-bold border bg-green-100 text-green-700 border-green-200`}>
                            {t("common.status")}: {t("common.active")}
                        </div>
                    </div>
                </div>
            </Card>

            <div className="grid lg:grid-cols-3 gap-6">

                <div className="lg:col-span-1 space-y-6">
                    <Card className="p-6">
                        <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                            <Activity className="w-5 h-5 text-accent" /> {t("mother.vitalsSummary")}
                        </h3>
                        <div className="space-y-4">
                            <div className="flex justify-between border-b pb-2">
                                <span className="text-gray-500">{t("common.phone")}</span>
                                <span className="font-medium">{mother.phone}</span>
                            </div>
                            <div className="flex justify-between border-b pb-2">
                                <span className="text-gray-500">{t("mother.gestationalAge")}</span>
                                <span className="font-medium">{mother.gestational_age_weeks} {t("common.weeks")}</span>
                            </div>
                            <div className="flex justify-between pb-2">
                                <span className="text-gray-500">{t("mother.lastAssessment")}</span>
                                <span className="font-medium text-sm">{history.length > 0 ? new Date(history[0].risk.timestamp).toLocaleDateString() : 'N/A'}</span>
                            </div>
                        </div>
                        <Button className="w-full mt-6">{t("mother.updateProfile")}</Button>
                    </Card>

                    {mother && (
                        <PatientQRCode motherId={motherId} patientName={mother.name} />
                    )}
                </div>

                <div className="lg:col-span-2 overflow-hidden">
                    <div className="flex gap-2 mb-4 bg-white/50 p-1 rounded-xl w-full overflow-x-auto whitespace-nowrap scrollbar-hide">
                        {['assessments', 'documents'].map((tab) => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`px-6 py-2 rounded-lg font-bold capitalize transition-all shrink-0 ${activeTab === tab ? "bg-gray-900 text-white shadow-md" : "text-gray-500 hover:bg-white"
                                    }`}
                            >
                                {tab === 'assessments' ? t("mother.assessmentsTab") : t("mother.documentsTab")}
                            </button>
                        ))}
                    </div>

                    <AnimatePresence mode="wait">
                        {activeTab === 'assessments' && (
                            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
                                <div className="flex justify-between items-center mb-2">
                                    <h3 className="font-bold text-gray-900">{t("mother.historyTitle")} ({history.length})</h3>
                                    <Button size="sm" variant="secondary">{t("common.download")}</Button>
                                </div>
                                {recordsToRender.map((record, i) => (
                                    <Card key={i} className="p-4 border-l-4 border-l-gray-900 hover:shadow-md transition-shadow">
                                        <div className="flex justify-between items-start mb-3">
                                            <div>
                                                <p className="text-sm font-bold text-gray-500">{new Date(record.risk.timestamp).toLocaleString()}</p>
                                                <div className="flex gap-4 mt-2">
                                                    <span className="text-sm">{t("assess.bp").split(" (")[0]}: <b>{record.vitals.systolic_bp}/{record.vitals.diastolic_bp}</b></span>
                                                    <span className="text-sm">{t("assess.weight")}: <b>{record.vitals.weight_kg} kg</b></span>
                                                    <span className="text-sm">{t("assess.hemoglobin").split(" (")[0]}: <b>{record.vitals.hemoglobin}</b></span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <div className={`px-3 py-1 rounded-full text-xs font-bold ${record.risk.risk_level === 'LOW' ? 'bg-green-100 text-green-700' :
                                                    record.risk.risk_level === 'MODERATE' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-700'
                                                    }`}>
                                                    {record.risk.risk_level} ({record.risk.overall_risk_score})
                                                </div>
                                                <button
                                                    onClick={() => handleDeleteAssessment(record.vitals.id)}
                                                    className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                    title={t("common.delete")}
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>

                                        <div className="bg-gray-50 p-2 rounded text-xs text-gray-600 mt-2">
                                            {record.risk.clinical_flags.length > 0 && (
                                                <p className="mb-1"><span className="font-semibold text-alert">{t("common.clinicalFlags")}:</span> {record.risk.clinical_flags.join(", ")}</p>
                                            )}
                                            {record.risk.nutrition_advice && (
                                                <p><span className="font-semibold text-gray-900">{t("assess.nutAdvice")}:</span> {Array.isArray(record.risk.nutrition_advice) ? record.risk.nutrition_advice[0] : Object.values(record.risk.nutrition_advice).flat()[0]}...</p>
                                            )}
                                        </div>

                                        {record.risk.asha_consultation_note && (
                                            <div className="bg-blue-50/50 p-3 rounded-lg text-sm text-blue-900 mt-3 border border-blue-100 shadow-sm">
                                                <span className="font-bold text-blue-800 flex items-center gap-2 mb-1">
                                                    <MessageCircle className="w-4 h-4" /> {t("assess.consultNote")}:
                                                </span>
                                                <p className="italic text-gray-700">"{record.risk.asha_consultation_note}"</p>
                                            </div>
                                        )}
                                    </Card>
                                ))}
                            </motion.div>
                        )}

                        {activeTab === 'documents' && (
                            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="font-bold text-gray-900">{t("mother.recordsTitle")}</h3>
                                    <div>
                                        <input type="file" id="doc-upload" className="hidden" onChange={handleUpload} accept=".pdf,.png,.jpg,.jpeg" />
                                        <label htmlFor="doc-upload" className="cursor-pointer inline-block bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 px-4 py-2 rounded-xl text-sm font-bold shadow-sm transition-colors">
                                            {uploading ? t("mother.uploading") : t("mother.uploadReport")}
                                        </label>
                                    </div>
                                </div>
                                {documents.length === 0 ? (
                                    <div className="p-8 text-center text-gray-500 bg-white rounded-2xl border border-dashed border-gray-300 shadow-sm">
                                        <FileText className="w-12 h-12 mx-auto mb-2 opacity-30 text-indigo-500" />
                                        <p className="font-medium">{t("mother.noDocs")}</p>
                                    </div>
                                ) : (
                                    <div className="grid gap-3">
                                        {documents.map((doc: any, i: number) => (
                                            <div key={i} className="bg-white p-4 rounded-xl border border-gray-100 flex justify-between items-center shadow-sm hover:shadow-md transition-shadow">
                                                <div className="flex items-center gap-4">
                                                    <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
                                                        <FileText className="w-6 h-6" />
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-gray-900">{doc.file_name}</p>
                                                        <p className="text-xs text-gray-500 font-medium mt-1 uppercase tracking-wider">{new Date(doc.uploaded_at).toLocaleString()}</p>
                                                    </div>
                                                </div>
                                                <a href={`${API_BASE_URL}/${doc.file_path}`} target="_blank" rel="noreferrer">
                                                    <Button variant="secondary" size="sm">View</Button>
                                                </a>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
}

