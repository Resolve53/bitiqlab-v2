/**
 * Session storage and recovery utilities
 * Persists trading session settings and trades to localStorage and database
 */

export interface SessionSettings {
  session_id: string;
  strategy_id: string;
  symbol: string;
  timeframe: string;
  initial_balance: number;
  auto_trade: boolean;
  monitoring_enabled: boolean;
  monitored_coins: string[];
  last_updated: number;
  created_at: number;
}

export interface SessionAlert {
  id: string;
  session_id: string;
  type: "trade" | "alert" | "signal";
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  data?: any;
}

class SessionStorageManager {
  private readonly STORAGE_KEY = "bitiq_session_settings";
  private readonly ALERTS_KEY = "bitiq_session_alerts";
  private readonly SESSION_HISTORY_KEY = "bitiq_session_history";

  /**
   * Save current session settings
   */
  saveSessionSettings(settings: SessionSettings): void {
    try {
      const current = this.getSessionSettings(settings.session_id) || {};
      const merged = { ...current, ...settings, last_updated: Date.now() };

      const allSettings = this.getAllSessionSettings();
      allSettings[settings.session_id] = merged;

      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(allSettings));
    } catch (error) {
      console.error("Failed to save session settings:", error);
    }
  }

  /**
   * Get settings for a specific session
   */
  getSessionSettings(session_id: string): SessionSettings | null {
    try {
      const allSettings = this.getAllSessionSettings();
      return allSettings[session_id] || null;
    } catch (error) {
      console.error("Failed to get session settings:", error);
      return null;
    }
  }

  /**
   * Get all saved session settings
   */
  getAllSessionSettings(): Record<string, SessionSettings> {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      return data ? JSON.parse(data) : {};
    } catch (error) {
      console.error("Failed to parse session settings:", error);
      return {};
    }
  }

  /**
   * Get all active sessions (sorted by most recent)
   */
  getActiveSessions(): SessionSettings[] {
    const allSettings = this.getAllSessionSettings();
    return Object.values(allSettings)
      .sort((a, b) => b.last_updated - a.last_updated);
  }

  /**
   * Add a session alert
   */
  addAlert(alert: SessionAlert): void {
    try {
      const allAlerts = this.getAllAlerts();
      allAlerts.push({ ...alert, id: `${Date.now()}_${Math.random()}` });

      // Keep only last 100 alerts per session
      const sessionAlerts = allAlerts.filter(a => a.session_id === alert.session_id);
      if (sessionAlerts.length > 100) {
        const otherAlerts = allAlerts.filter(a => a.session_id !== alert.session_id);
        localStorage.setItem(
          this.ALERTS_KEY,
          JSON.stringify([...otherAlerts, ...sessionAlerts.slice(-100)])
        );
      } else {
        localStorage.setItem(this.ALERTS_KEY, JSON.stringify(allAlerts));
      }
    } catch (error) {
      console.error("Failed to add alert:", error);
    }
  }

  /**
   * Get all alerts for a session
   */
  getSessionAlerts(session_id: string): SessionAlert[] {
    try {
      const allAlerts = this.getAllAlerts();
      return allAlerts
        .filter(a => a.session_id === session_id)
        .sort((a, b) => b.timestamp - a.timestamp);
    } catch (error) {
      console.error("Failed to get session alerts:", error);
      return [];
    }
  }

  /**
   * Get all alerts
   */
  getAllAlerts(): SessionAlert[] {
    try {
      const data = localStorage.getItem(this.ALERTS_KEY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error("Failed to parse alerts:", error);
      return [];
    }
  }

  /**
   * Mark alert as read
   */
  markAlertAsRead(alert_id: string): void {
    try {
      const allAlerts = this.getAllAlerts();
      const updated = allAlerts.map(a =>
        a.id === alert_id ? { ...a, read: true } : a
      );
      localStorage.setItem(this.ALERTS_KEY, JSON.stringify(updated));
    } catch (error) {
      console.error("Failed to mark alert as read:", error);
    }
  }

  /**
   * Clear alerts for a session
   */
  clearSessionAlerts(session_id: string): void {
    try {
      const allAlerts = this.getAllAlerts();
      const filtered = allAlerts.filter(a => a.session_id !== session_id);
      localStorage.setItem(this.ALERTS_KEY, JSON.stringify(filtered));
    } catch (error) {
      console.error("Failed to clear alerts:", error);
    }
  }

  /**
   * Remove a session from storage
   */
  removeSession(session_id: string): void {
    try {
      const allSettings = this.getAllSessionSettings();
      delete allSettings[session_id];
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(allSettings));
      this.clearSessionAlerts(session_id);
    } catch (error) {
      console.error("Failed to remove session:", error);
    }
  }
}

export const sessionStorageManager = new SessionStorageManager();
