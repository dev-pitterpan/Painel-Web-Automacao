"use client";

import { AlertCircle, Bell, CheckCircle2, X } from "lucide-react";

export type NotificationItem = {
  id: string;
  tone: "success" | "error";
  message: string;
  createdAt: string;
};

export function NotificationCenter({
  notifications,
  open,
  onOpenChange,
  onClear,
  onRemove,
}: {
  notifications: NotificationItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClear: () => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="notification-center">
      <button
        className="notification-button"
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-label="Abrir notificações"
        aria-expanded={open}
      >
        <Bell size={17} />
        {notifications.length > 0 && (
          <span className="notification-count">
            {notifications.length > 9 ? "9+" : notifications.length}
          </span>
        )}
      </button>
      {open && (
        <div className="notification-panel">
          <div className="notification-panel-head">
            <strong>Notificações</strong>
            <button type="button" onClick={onClear}>
              Limpar
            </button>
          </div>
          {notifications.length === 0 ? (
            <p className="notification-empty">Nenhum evento recente.</p>
          ) : (
            notifications.map((item) => (
              <div
                className={`notification-item notification-item-${item.tone}`}
                key={item.id}
              >
                {item.tone === "success" ? (
                  <CheckCircle2 size={16} />
                ) : (
                  <AlertCircle size={16} />
                )}
                <span>
                  {item.message}
                  <small>{item.createdAt}</small>
                </span>
                <button
                  type="button"
                  aria-label="Remover notificação"
                  onClick={() => onRemove(item.id)}
                >
                  <X size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
