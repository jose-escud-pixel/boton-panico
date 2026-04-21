import React from "react";
import { Phone } from "lucide-react";

/**
 * Badges de patrocinadores/contactos para la app cliente.
 * SVGs inline sin fondo para adaptarse a cualquier tema.
 * El número de teléfono es clickeable → llama directamente.
 */

function JarBadge({ size = 44 }) {
  return (
    <svg viewBox="0 0 100 120" width={size} height={(size * 120) / 100} aria-label="JAR">
      <defs>
        <linearGradient id="jarGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#f87171" />
          <stop offset="100%" stopColor="#dc2626" />
        </linearGradient>
      </defs>
      <rect x="20" y="5" width="60" height="110" rx="20" ry="20" fill="url(#jarGrad)" />
      {/* Phone top */}
      <rect x="35" y="20" width="30" height="38" rx="4" fill="none" stroke="white" strokeWidth="3.5" />
      <circle cx="41" cy="26" r="1.5" fill="white" />
      {/* Phone bottom */}
      <rect x="35" y="62" width="30" height="38" rx="4" fill="none" stroke="white" strokeWidth="3.5" />
      <circle cx="41" cy="68" r="1.5" fill="white" />
    </svg>
  );
}

function AranduBadge({ size = 44 }) {
  return (
    <svg viewBox="0 0 100 120" width={size} height={(size * 120) / 100} aria-label="ARANDU">
      <defs>
        <linearGradient id="aranduGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#60a5fa" />
          <stop offset="100%" stopColor="#2563eb" />
        </linearGradient>
      </defs>
      <rect x="20" y="5" width="60" height="110" rx="20" ry="20" fill="url(#aranduGrad)" />
      {/* Chip body */}
      <rect x="36" y="40" width="28" height="40" rx="3" fill="none" stroke="white" strokeWidth="3" />
      <rect x="44" y="50" width="12" height="20" rx="1" fill="none" stroke="white" strokeWidth="2.5" />
      {/* Chip pins - top & bottom */}
      {[40, 46, 52, 58].map((x) => (
        <React.Fragment key={x}>
          <line x1={x} y1="33" x2={x} y2="40" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
          <line x1={x} y1="80" x2={x} y2="87" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
        </React.Fragment>
      ))}
      {/* Chip pins - left & right */}
      {[45, 53, 61, 69].map((y) => (
        <React.Fragment key={y}>
          <line x1="29" y1={y} x2="36" y2={y} stroke="white" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="64" y1={y} x2="71" y2={y} stroke="white" strokeWidth="2.5" strokeLinecap="round" />
        </React.Fragment>
      ))}
    </svg>
  );
}

function ContactCard({ Badge, name, subtitle, phone, tel, accent, isDark }) {
  return (
    <a
      href={`tel:${tel}`}
      className={`flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all flex-1 min-w-0 group
                  ${isDark
                    ? "bg-slate-800/60 border border-slate-700/60 hover:bg-slate-800 hover:border-slate-600"
                    : "bg-white/80 border border-slate-200 hover:bg-white hover:border-slate-300 shadow-sm hover:shadow-md"}`}
      data-testid={`sponsor-${name.toLowerCase()}`}
    >
      <Badge size={36} />
      <div className="min-w-0 flex-1">
        <div className={`flex items-baseline gap-1 font-heading font-bold text-sm leading-tight ${
          isDark ? "text-white" : "text-slate-900"
        }`}>
          {name}
          <span className={`text-[0.55rem] font-normal tracking-wide ${
            isDark ? "text-slate-400" : "text-slate-500"
          }`}>
            {subtitle}
          </span>
        </div>
        <div className={`flex items-center gap-1 mt-0.5 text-xs font-mono tracking-tight ${
          accent === "rose" ? "text-rose-600 dark:text-rose-400" : "text-blue-600 dark:text-blue-400"
        } group-hover:underline`}>
          <Phone className="w-3 h-3" strokeWidth={2.2} />
          {phone}
        </div>
      </div>
    </a>
  );
}

export default function SponsorContacts({ isDark = false }) {
  return (
    <div className="flex items-stretch gap-2 mb-4" data-testid="sponsor-contacts">
      <ContactCard
        Badge={JarBadge}
        name="JAR"
        subtitle="INFORMÁTICA"
        phone="0985-720-777"
        tel="0985720777"
        accent="rose"
        isDark={isDark}
      />
      <ContactCard
        Badge={AranduBadge}
        name="ARANDU"
        subtitle="INFORMÁTICA"
        phone="0981-500-282"
        tel="0981500282"
        accent="blue"
        isDark={isDark}
      />
    </div>
  );
}
