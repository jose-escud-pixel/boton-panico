import React from "react";

/**
 * Logos de organizaciones patrocinadoras.
 * Se muestran en chips con fondo blanco (las imágenes tienen fondo blanco
 * pegado, así quedan limpios en ambos temas) y transición suave.
 */
const SPONSORS = [
  { id: "copronar", name: "COPRONAR", src: "/boton-panico/sponsors/copronar.png" },
  { id: "naranjal", name: "Municipalidad Naranjal", src: "/boton-panico/sponsors/naranjal.png" },
  { id: "raulpena", name: "Coop. Raúl Peña", src: "/boton-panico/sponsors/raulpena.png" },
];

// En dev (preview), el basePath puede ser vacío. Probamos ambos.
function resolvePath(src) {
  // Si estamos corriendo directo sin basePath, removemos /boton-panico/
  if (typeof window !== "undefined" && !window.location.pathname.startsWith("/boton-panico")) {
    return src.replace("/boton-panico", "");
  }
  return src;
}

export default function OrganizationLogos({ isDark = false }) {
  return (
    <div className="flex items-center gap-2 flex-wrap justify-end" data-testid="organization-logos">
      {SPONSORS.map((s) => (
        <div
          key={s.id}
          className={`flex items-center justify-center w-11 h-11 rounded-xl overflow-hidden bg-white border shadow-sm transition-all hover:scale-105 ${
            isDark ? "border-slate-700" : "border-slate-200"
          }`}
          title={s.name}
          data-testid={`sponsor-logo-${s.id}`}
        >
          <img
            src={resolvePath(s.src)}
            alt={s.name}
            className="w-full h-full object-contain p-1"
            loading="lazy"
          />
        </div>
      ))}
    </div>
  );
}
