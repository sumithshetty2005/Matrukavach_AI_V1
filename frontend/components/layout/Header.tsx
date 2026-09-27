"use client";

import React, { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, Globe } from "lucide-react";
import { useLanguage } from "@/components/LanguageContext";
import { LANGUAGES, Language } from "@/lib/translations";

export function Header() {
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const { language, setLanguage, t } = useLanguage();

    return (
        <motion.header
            initial={{ y: -100 }}
            animate={{ y: 0 }}
            className="sticky top-0 z-50 w-full border-b border-gray-200/50 bg-white/60 backdrop-blur-xl"
        >
            <div className="container mx-auto px-4 h-20 flex items-center justify-between">
                <Link href="/" className="flex items-center gap-2 group">
                    <span className="text-2xl font-heading font-medium tracking-tight text-black">
                        {t("nav.logo")}
                    </span>
                </Link>

                <nav className="hidden md:flex items-center gap-8 font-medium text-black">
                    <Link href="/asha" className="hover:text-gray-500 transition-colors">{t("nav.ashaPortal")}</Link>

                    {/* Language Dropdown */}
                    <div className="flex items-center gap-2 bg-gray-100/80 hover:bg-gray-100 px-3 py-1.5 rounded-full border border-gray-200/60 transition-colors">
                        <Globe className="w-4 h-4 text-gray-500" />
                        <select
                            value={language}
                            onChange={(e) => setLanguage(e.target.value as Language)}
                            className="bg-transparent text-sm font-semibold text-gray-700 outline-none cursor-pointer pr-1"
                        >
                            {LANGUAGES.map((lang) => (
                                <option key={lang.code} value={lang.code} className="text-black bg-white">
                                    {lang.nativeLabel}
                                </option>
                            ))}
                        </select>
                    </div>

                </nav>

                <div className="md:hidden flex items-center">
                    <button
                        className="p-2 text-gray-800 focus:outline-none"
                        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                    >
                        {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
                    </button>
                </div>
            </div>

            <AnimatePresence>
                {isMobileMenuOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: -15 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -15 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className="md:hidden bg-white border-b border-gray-200 overflow-hidden shadow-2xl relative z-40"
                    >
                        <nav className="flex flex-col px-6 py-6 gap-4 font-medium text-black">
                            <Link href="/asha" onClick={() => setIsMobileMenuOpen(false)} className="py-2.5 border-b border-gray-100 hover:text-gray-500 transition-colors">{t("nav.ashaPortal")}</Link>

                            {/* Mobile Language Selector */}
                            <div className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-xl border border-gray-100 text-sm mt-1">
                                <Globe className="w-4 h-4 text-gray-400" />
                                <span className="text-gray-500 font-semibold">Language</span>
                                <select
                                    value={language}
                                    onChange={(e) => setLanguage(e.target.value as Language)}
                                    className="bg-transparent text-sm font-bold text-gray-800 outline-none cursor-pointer ml-auto pr-2"
                                >
                                    {LANGUAGES.map((lang) => (
                                        <option key={lang.code} value={lang.code}>
                                            {lang.nativeLabel}
                                        </option>
                                    ))}
                                </select>
                            </div>

                        </nav>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.header>
    );
}
