/**
 * Library Stats Renderer - Progress Chart Module
 */
window.EveLibrary = window.EveLibrary || {};
window.EveLibrary.StatsRendererChartModules = window.EveLibrary.StatsRendererChartModules || {};

(function (modules) {
    if (modules.progress) return;

    function renderProgressCharts(params) {
        const {
            categoryName,
            entries,
            getPrefix,
            axisMax,
            StatsCalc,
            ChartUtils,
            widgets,
            labels,
            escapeHtml
        } = params || {};

        const prefix = getPrefix(categoryName);
        const copy = labels || {};
        const progressDatasetLabel = copy.progressDataset || 'Chapters / Episodes Read';
        const monthlyDatasetLabel = copy.monthlyDataset || 'Chapters Read';
        const scatterAxisLabel = copy.scatterAxis || 'Chapters / Episodes Read';

        const habits = StatsCalc.calcDailyReadingHabits ? StatsCalc.calcDailyReadingHabits(entries, 30) : { labels: [], activityCounts: [], progressTotals: [] };
        const habitLabels = habits.labels?.length ? habits.labels : ['No Data'];
        const habitActivity = habits.activityCounts?.length ? habits.activityCounts : [0];
        const habitProgress = habits.progressTotals?.length ? habits.progressTotals : [0];
        ChartUtils.createChart(`${prefix}habitsChart`, `${prefix}habits`, 'line', habitLabels, [
            { label: 'Entries Updated', data: habitActivity, borderColor: 'rgba(130,227,159,0.95)', backgroundColor: 'rgba(130,227,159,0.2)', fill: true, tension: 0.28, yAxisID: 'y' },
            { label: progressDatasetLabel, data: habitProgress, borderColor: 'rgba(255,159,64,0.95)', backgroundColor: 'rgba(255,159,64,0.2)', fill: false, tension: 0.28, yAxisID: 'y1' }
        ], {
            scales: {
                x: { ticks: { color: '#aaa', maxRotation: 0, callback(value, index) { return index % 3 === 0 ? habitLabels[index] : ''; } }, grid: { color: '#444' } },
                y: { beginAtZero: true, max: axisMax(habitActivity), ticks: { color: '#9ff1b7', precision: 0 }, grid: { color: '#444' } },
                y1: { beginAtZero: true, max: axisMax(habitProgress), position: 'right', ticks: { color: '#ffc292', precision: 0 }, grid: { drawOnChartArea: false } }
            }
        });

        const monthly = StatsCalc.calcMonthlyReadingProgress
            ? StatsCalc.calcMonthlyReadingProgress(entries, 12)
            : { labels: [], chaptersRead: [] };
        const monthlyLabels = monthly.labels?.length ? monthly.labels : ['No Data'];
        const monthlyChapters = monthly.chaptersRead?.length ? monthly.chaptersRead : [0];
        ChartUtils.createChart(`${prefix}monthlyProgressChart`, `${prefix}monthly-progress`, 'line', monthlyLabels, [{
            label: monthlyDatasetLabel,
            data: monthlyChapters,
            borderColor: 'rgba(170, 110, 255, 0.98)',
            backgroundColor: 'rgba(170, 110, 255, 0.24)',
            fill: true,
            tension: 0.42,
            pointRadius: 3,
            pointHoverRadius: 5
        }], {
            scales: {
                x: { ticks: { color: '#d8c4ff' }, grid: { color: '#443b5a' } },
                y: { beginAtZero: true, max: axisMax(monthlyChapters), ticks: { color: '#c7a9ff', precision: 0 }, grid: { color: '#443b5a' } }
            },
            plugins: { legend: { display: false } }
        });

        const points = StatsCalc.calcLengthVsQuality ? StatsCalc.calcLengthVsQuality(entries).slice(0, 250) : [];
        ChartUtils.createChart(`${prefix}scatterChart`, `${prefix}scatter`, 'scatter', [], [{
            label: 'Series',
            data: points,
            backgroundColor: 'rgba(0, 212, 255, 0.65)',
            borderColor: 'rgba(0, 212, 255, 0.95)',
            pointRadius: 4
        }], {
            scales: {
                x: { beginAtZero: true, ticks: { color: '#ddd', precision: 0 }, title: { display: true, text: scatterAxisLabel, color: '#b7dfff' }, grid: { color: '#444' } },
                y: { beginAtZero: true, max: 5, ticks: { color: '#ddd' }, title: { display: true, text: 'Personal Rating (0-5)', color: '#b7dfff' }, grid: { color: '#444' } }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label(context) {
                            const raw = context.raw || {};
                            const title = raw.title ? `${raw.title}: ` : '';
                            return `${title}${Number(raw.x || 0).toFixed(0)} units, ${Number(raw.y || 0).toFixed(2)}/5`;
                        }
                    }
                }
            }
        });

        widgets?.renderTagCloud?.({ prefix, entries, StatsCalc, escapeHtml });
    }

    modules.progress = {
        renderProgressCharts
    };
})(window.EveLibrary.StatsRendererChartModules);
