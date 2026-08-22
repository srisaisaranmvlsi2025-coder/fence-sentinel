/**
 * FENCE SENTINEL - Inspection & Field Documentation Report Generator (reports.js)
 * Generates official field inspection reports, printable PDF document templates, and export streams.
 */

class SentinelReportGenerator {
    constructor() {}

    /**
     * Generate HTML printable report payload for a specific detection event or patrol session
     */
    generateEventReportHTML(event, officerInfo = {}) {
        const officerName = officerInfo.name || 'Officer / Safety Inspector';
        const department = officerInfo.dept || 'Field Patrol Operations';
        const dateStr = new Date(event.timestamp).toLocaleDateString('en-US', {
            year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit'
        });

        const statusColorMap = {
            'Detected': '#06B6D4',
            'Flagged': '#EF4444',
            'Verified': '#10B981',
            'False Positive': '#8B5CF6'
        };
        const statusColor = statusColorMap[event.status] || '#F59E0B';

        const explanationsHTML = (event.explanation || [])
            .map(item => `<li><span style="color: #10B981;">✓</span> ${item}</li>`)
            .join('');

        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <title>FENCE SENTINEL FIELD REPORT - ${event.id}</title>
                <style>
                    body {
                        font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif;
                        background: #ffffff;
                        color: #1f2937;
                        margin: 0;
                        padding: 30px;
                        line-height: 1.5;
                    }
                    .report-header {
                        border-bottom: 3px solid #0f172a;
                        padding-bottom: 15px;
                        margin-bottom: 25px;
                        display: flex;
                        justify-content: space-between;
                        align-items: flex-end;
                    }
                    .logo-title {
                        font-size: 26px;
                        font-weight: 800;
                        color: #0f172a;
                        letter-spacing: 1px;
                    }
                    .subtitle {
                        font-size: 13px;
                        color: #64748b;
                        margin-top: 3px;
                        font-weight: 600;
                        text-transform: uppercase;
                    }
                    .meta-badge {
                        text-align: right;
                    }
                    .report-id {
                        font-family: 'Courier New', monospace;
                        font-size: 18px;
                        font-weight: 700;
                        color: #0f172a;
                    }
                    .status-pill {
                        display: inline-block;
                        padding: 4px 12px;
                        border-radius: 20px;
                        color: #ffffff;
                        font-size: 12px;
                        font-weight: 700;
                        margin-top: 5px;
                        text-transform: uppercase;
                    }
                    .section-title {
                        font-size: 14px;
                        font-weight: 700;
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                        color: #0f172a;
                        border-bottom: 1px solid #e2e8f0;
                        padding-bottom: 6px;
                        margin-top: 25px;
                        margin-bottom: 12px;
                    }
                    .grid-table {
                        width: 100%;
                        border-collapse: collapse;
                        margin-bottom: 20px;
                    }
                    .grid-table th {
                        background: #f8fafc;
                        text-align: left;
                        padding: 8px 12px;
                        font-size: 11px;
                        text-transform: uppercase;
                        color: #475569;
                        border: 1px solid #e2e8f0;
                    }
                    .grid-table td {
                        padding: 8px 12px;
                        font-size: 13px;
                        border: 1px solid #e2e8f0;
                        font-family: 'Courier New', monospace;
                    }
                    .box {
                        background: #f8fafc;
                        border: 1px solid #e2e8f0;
                        border-radius: 6px;
                        padding: 15px;
                        margin-bottom: 20px;
                    }
                    ul.expl-list {
                        list-style: none;
                        padding-left: 0;
                        margin: 0;
                        font-size: 13px;
                    }
                    ul.expl-list li {
                        margin-bottom: 6px;
                    }
                    .footer-notice {
                        margin-top: 40px;
                        border-top: 1px dashed #cbd5e1;
                        padding-top: 15px;
                        font-size: 11px;
                        color: #64748b;
                        text-align: center;
                    }
                    @media print {
                        body { padding: 0; }
                    }
                </style>
            </head>
            <body>
                <div class="report-header">
                    <div>
                        <div class="logo-title">FENCE SENTINEL</div>
                        <div class="subtitle">Electrical Field Safety & Inspection Monitoring</div>
                    </div>
                    <div class="meta-badge">
                        <div class="report-id">${event.id}</div>
                        <div class="status-pill" style="background: ${statusColor}">${event.status}</div>
                    </div>
                </div>

                <div class="box" style="display: flex; justify-content: space-between;">
                    <div>
                        <strong>Date/Time:</strong> ${dateStr}<br>
                        <strong>Patrol Sector:</strong> GPS (${event.lat ? event.lat.toFixed(5) : 'N/A'}, ${event.lng ? event.lng.toFixed(5) : 'N/A'})<br>
                        <strong>Data Origin:</strong> ${event.isDemo ? 'DEMO SIMULATION' : 'HARDWARE BLE SENSOR'}
                    </div>
                    <div style="text-align: right;">
                        <strong>Inspector:</strong> ${officerName}<br>
                        <strong>Department:</strong> ${department}<br>
                        <strong>Mode:</strong> Non-Contact Electrical Sensing
                    </div>
                </div>

                <div class="section-title">I. Signal Telemetry & Classification</div>
                <table class="grid-table">
                    <tr>
                        <th>Primary Classification</th>
                        <th>Confidence Score</th>
                        <th>Signal Strength</th>
                        <th>Dominant Frequency</th>
                    </tr>
                    <tr>
                        <td><strong>${event.type}</strong></td>
                        <td>${event.confidence}%</td>
                        <td>${event.signal}%</td>
                        <td>${event.frequency} Hz</td>
                    </tr>
                    <tr>
                        <th>RMS Voltage (Relative)</th>
                        <th>Peak-to-Peak (V)</th>
                        <th>Noise Floor (V)</th>
                        <th>Signal Stability</th>
                    </tr>
                    <tr>
                        <td>${event.rms} V</td>
                        <td>${event.peakToPeak} V</td>
                        <td>${event.noise} V</td>
                        <td>${event.confidence > 80 ? 'HIGH' : 'MODERATE'}</td>
                    </tr>
                </table>

                <div class="section-title">II. Explainable Intelligence Rationale</div>
                <div class="box">
                    <ul class="expl-list">
                        ${explanationsHTML}
                    </ul>
                </div>

                <div class="section-title">III. Officer Field Inspection Notes</div>
                <div class="box" style="min-height: 60px;">
                    ${event.notes ? event.notes : '<em>No additional field notes entered for this event.</em>'}
                </div>

                <div class="footer-notice">
                    <strong>LEGAL & SAFETY DISCLAIMER:</strong> Fence Sentinel provides non-contact physical electrical-field pattern analysis.
                    Classifications indicate signal characteristics ("Mains-like", "Pulsed") for inspection prioritization and do not independently constitute a legal ruling. Maintain safe standoff distances around all energized infrastructure.
                </div>
            </body>
            </html>
        `;
    }

    /**
     * Trigger browser print popup for an event report
     */
    printReport(event, officerInfo = {}) {
        const html = this.generateEventReportHTML(event, officerInfo);
        const win = window.open('', '_blank', 'width=900,height=750');
        win.document.write(html);
        win.document.close();
        win.focus();
        setTimeout(() => {
            win.print();
        }, 500);
    }

    /**
     * Download CSV file of detections array
     */
    downloadCSV(detections, filename = `fence_sentinel_report_${Date.now()}.csv`) {
        if (!window.sentinelStorage) return;
        const csvContent = window.sentinelStorage.exportToCSV(detections);
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    /**
     * Download JSON backup file of detections
     */
    downloadJSON(detections, filename = `fence_sentinel_backup_${Date.now()}.json`) {
        const jsonStr = JSON.stringify(detections, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

// Global Singleton Instance
window.sentinelReport = new SentinelReportGenerator();
