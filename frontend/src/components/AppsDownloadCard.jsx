import React from "react";
import { Smartphone, Download, ShieldCheck, Siren } from "lucide-react";
import { openApkDownload } from "../lib/apkDownload";

/**
 * Card con enlaces de descarga para las dos APKs.
 * Se muestra en el Dashboard del admin.
 * Sólo visible en web (no dentro de la app nativa).
 */
const APKS = {
  client: {
    name: "ÑACURUTU Seguridad",
    subtitle: "Para clientes — botón de pánico SOS",
    url: "/boton-panico/downloads/nacurutu-latest.apk",
    versionUrl: "/boton-panico/downloads/version.json",
    gradient: "from-rose-500 to-red-700",
    Icon: Siren,
    testid: "download-client-apk",
  },
  admin: {
    name: "ÑACURUTU Seguridad Admin",
    subtitle: "Para administradores — dashboard + alertas",
    url: "/boton-panico/downloads/nacurutu-admin-latest.apk",
    versionUrl: "/boton-panico/downloads/version-admin.json",
    gradient: "from-slate-800 to-slate-950",
    Icon: ShieldCheck,
    testid: "download-admin-apk",
  },
};

function ApkRow({ kind }) {
  const cfg = APKS[kind];
  const { Icon } = cfg;
  return (
    <button
      type="button"
      onClick={() => openApkDownload(cfg.url)}
      className="w-full flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-rose-300 dark:hover:border-rose-700 bg-white dark:bg-slate-800/60 transition-all hover:shadow-md group text-left"
      data-testid={cfg.testid}
    >
      <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${cfg.gradient} flex items-center justify-center flex-shrink-0 shadow-sm`}>
        <Icon className="w-6 h-6 text-white" strokeWidth={2} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 font-heading font-bold text-sm text-slate-900 dark:text-white">
          {cfg.name}
          {kind === "admin" && (
            <span className="text-[0.55rem] font-mono tracking-wider bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 px-1.5 py-0.5 rounded uppercase">
              ADMIN
            </span>
          )}
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
          {cfg.subtitle}
        </div>
      </div>
      <Download className="w-5 h-5 text-slate-400 group-hover:text-rose-600 transition-colors flex-shrink-0" strokeWidth={2} />
    </button>
  );
}

export default function AppsDownloadCard() {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-4" data-testid="apps-download-card">
      <div className="flex items-center gap-2 mb-3">
        <Smartphone className="w-4 h-4 text-rose-600" strokeWidth={2} />
        <h3 className="overline text-slate-700 dark:text-slate-300 text-sm">
          Apps Android — Instalación
        </h3>
      </div>
      <div className="space-y-2">
        <ApkRow kind="client" />
        <ApkRow kind="admin" />
      </div>
      <p className="text-[0.65rem] text-slate-400 mt-3 leading-relaxed">
        Instalá la APK <b>Admin</b> en los celulares de tu equipo de monitoreo. La de cliente es para los usuarios finales.
      </p>
    </div>
  );
}
