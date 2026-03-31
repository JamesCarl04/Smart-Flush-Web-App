"use client";

import { useState } from "react";
import toast, { Toaster } from "react-hot-toast";
import { useAlerts, AlertSeverity } from "@/hooks/useAlerts";
import { formatDistanceToNow } from "date-fns";
import { Bell, CheckCircle2, AlertTriangle, Info, AlertOctagon, CheckSquare } from "lucide-react";

export default function AlertsPage() {
  const { alerts, unreadCount, loading, acknowledgeAlert } = useAlerts();
  const [filter, setFilter] = useState<'all' | 'critical_high' | 'unread'>('all');

  const filteredAlerts = alerts.filter(alert => {
    if (filter === 'unread') return !alert.acknowledged;
    if (filter === 'critical_high') return alert.severity === 'critical' || alert.severity === 'high';
    return true; // 'all'
  });

  const getSeverityBadge = (severity: AlertSeverity) => {
    switch (severity) {
      case 'critical': return "badge-error text-white font-bold";
      case 'high': return "badge-warning font-semibold";
      case 'medium': return "badge-warning badge-outline";
      case 'low': return "badge-info badge-outline";
    }
  };

  const getSeverityIcon = (severity: AlertSeverity) => {
    switch (severity) {
      case 'critical': return <AlertOctagon className="w-5 h-5 text-error" />;
      case 'high': return <AlertTriangle className="w-5 h-5 text-warning" />;
      case 'medium': return <AlertTriangle className="w-5 h-5 text-warning/70" />;
      case 'low': return <Info className="w-5 h-5 text-info" />;
    }
  };

  const handleAcknowledge = async (id: string | 'ALL') => {
    const success = await acknowledgeAlert(id);
    if (success) {
      toast.success(id === 'ALL' ? 'All alerts acknowledged' : 'Alert acknowledged');
    } else {
      toast.error('Failed to acknowledge alert');
    }
  };

  return (
    <div className="container mx-auto p-4 md:p-8 max-w-5xl animate-fade-in">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary flex items-center gap-3">
            <Bell className="w-8 h-8 text-primary" />
            System Alerts
          </h1>
          <p className="text-base-content/60 mt-2">Monitor critical hardware deviations and system notifications.</p>
        </div>
        
        <div className="flex gap-4 items-center">
          <div className="bg-base-200 px-4 py-2 rounded-lg border border-base-300 shadow-sm flex items-center gap-2">
            <span className="text-sm font-medium">Unread</span>
            <div className="badge badge-primary">{unreadCount}</div>
          </div>
          <button 
            className="btn btn-neutral btn-sm"
            onClick={() => handleAcknowledge('ALL')}
            disabled={unreadCount === 0 || loading}
          >
            <CheckSquare className="w-4 h-4" /> Ack All
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="card bg-base-100 shadow-xl border border-base-200">
        <div className="card-body p-0">
          
          {/* Tabs */}
          <div className="tabs tabs-bordered p-4 border-b border-base-200">
            <button 
              className={`tab tab-lg ${filter === 'all' ? 'tab-active font-bold' : ''}`}
              onClick={() => setFilter('all')}
            >
              All Alerts
            </button>
            <button 
              className={`tab tab-lg ${filter === 'critical_high' ? 'tab-active font-bold' : ''}`}
              onClick={() => setFilter('critical_high')}
            >
              Critical & High
            </button>
            <button 
              className={`tab tab-lg ${filter === 'unread' ? 'tab-active font-bold' : ''}`}
              onClick={() => setFilter('unread')}
            >
              Unacknowledged
            </button>
          </div>

          {/* Alert List */}
          <div className="p-4 bg-base-100/50">
            {loading ? (
              <div className="space-y-4">
                {[1,2,3].map(i => <div key={i} className="skeleton h-24 w-full"></div>)}
              </div>
            ) : filteredAlerts.length === 0 ? (
              <div className="py-16 flex flex-col items-center justify-center text-center text-base-content/50">
                <CheckCircle2 className="w-16 h-16 text-success/20 mb-4" />
                <h3 className="text-xl font-semibold mb-2">You&apos;re all caught up!</h3>
                <p>No alerts found matching the current filter.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredAlerts.map(alert => (
                  <div key={alert.id} className={`p-4 rounded-xl border transition-all ${alert.acknowledged ? 'bg-base-200/30 border-base-200 opacity-70' : 'bg-base-100 border-base-300 shadow-sm hover:border-primary/50 hover:shadow-md'}`}>
                    <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                      <div className="flex items-start gap-4 mt-1">
                        <div className="mt-1 shrink-0">{getSeverityIcon(alert.severity)}</div>
                        <div>
                          <div className="flex items-center gap-3 mb-1">
                            <h3 className={`font-bold ${alert.acknowledged ? 'text-base-content/70' : ''}`}>{alert.title}</h3>
                            <div className={`badge badge-sm uppercase tracking-wider text-[10px] ${getSeverityBadge(alert.severity)}`}>
                              {alert.severity}
                            </div>
                          </div>
                          <p className="text-sm w-full md:max-w-xl text-base-content/70">{alert.description}</p>
                          <div className="text-xs text-base-content/40 mt-2 font-mono">
                            {formatDistanceToNow(new Date(alert.timestamp), { addSuffix: true })}
                          </div>
                        </div>
                      </div>
                      <div className="shrink-0 w-full md:w-auto flex justify-end">
                        {!alert.acknowledged ? (
                          <button 
                            className="btn btn-outline btn-sm btn-primary w-full md:w-auto"
                            onClick={() => handleAcknowledge(alert.id)}
                          >
                            <CheckCircle2 className="w-4 h-4" /> Acknowledge
                          </button>
                        ) : (
                          <div className="text-success text-sm flex items-center justify-end md:justify-center gap-1 font-medium px-3 py-1 bg-success/10 rounded-full w-fit">
                            <CheckCircle2 className="w-4 h-4" /> Acknowledged
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
      <Toaster position="top-right" />
    </div>
  );
}
