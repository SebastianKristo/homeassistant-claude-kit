import { Icon } from "@iconify/react";
import { APP_DEFINITIONS, type AppDefinition } from "../../lib/tv-adapter";

interface AppStripProps {
  activeApp: AppDefinition | undefined;
  onLaunch: (app: AppDefinition) => void;
}

export function AppStrip({ activeApp, onLaunch }: AppStripProps) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
      {APP_DEFINITIONS.map((app) => {
        const isActive = activeApp?.name === app.name;
        return (
          <button
            key={app.name}
            onClick={() => onLaunch(app)}
            className={`flex shrink-0 flex-col items-center justify-center rounded-xl p-2 transition-colors active:bg-white/10 ${
              isActive ? "bg-white/5" : "bg-white/4 hover:bg-white/8"
            }`}
            style={{
              border: isActive
                ? `1px solid ${app.color}`
                : "1px solid rgba(255,255,255,0.06)",
            }}
          >
            {app.logoText ? (
              <div
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[10px] font-black leading-none tracking-tight"
                style={{ background: `${app.color}22`, color: app.color }}
              >
                {app.logoText}
              </div>
            ) : (
              <div
                className="flex h-8 w-8 items-center justify-center rounded-lg"
                style={{ background: `${app.color}22` }}
              >
                <Icon icon={app.icon} width={20} style={{ color: app.color }} />
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
