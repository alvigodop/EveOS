/**
 * Library Stats Renderer - Chart Module
 */
window.EveLibrary = window.EveLibrary || {};

(function () {
    function renderCharts(params) {
        const {
            categoryName,
            entries,
            getPrefix,
            getBreakdownMode,
            getDistributionMode,
            axisMax,
            StatsCalc,
            ChartUtils,
            widgets,
            escapeHtml
        } = params || {};

        const prefix = getPrefix(categoryName);

        const breakdownMode = getBreakdownMode(categoryName);
        const breakdownCounts = breakdownMode === 'origin'
            ? (StatsCalc.calcOriginCounts ? StatsCalc.calcOriginCounts(entries) : {})
            : (StatsCalc.calcStatusCounts ? StatsCalc.calcStatusCounts(entries) : {});
        const breakdownPairs = breakdownMode === 'origin'
            ? Object.entries(breakdownCounts).filter(([, count]) => Number(count) > 0).sort((a, b) => b[1] - a[1]).slice(0, 8)
            : Object.entries(breakdownCounts).filter(([, count]) => count > 0);
        const breakdownLabels = breakdownPairs.length ? breakdownPairs.map(([label]) => label) : ['No Data'];
        const breakdownValues = breakdownPairs.length ? breakdownPairs.map(([, count]) => count) : [1];
        ChartUtils.createChart(`${prefix}breakdownChart`, `${prefix}breakdown`, 'doughnut', breakdownLabels, [{
            data: breakdownValues,
            backgroundColor: ChartUtils.generateColors(breakdownLabels.length)
        }], {
            plugins: { legend: { position: 'right', labels: { color: '#e0e0e0' } } }
        });

        const distributionMode = getDistributionMode(categoryName);
        const isTagMode = distributionMode === 'tags';
        const distributionCounts = isTagMode
            ? (StatsCalc.calcTagCounts ? StatsCalc.calcTagCounts(entries) : {})
            : (StatsCalc.calcGenreCounts ? StatsCalc.calcGenreCounts(entries) : {});
        const distributionPairs = Object.entries(distributionCounts)
            .filter(([, count]) => Number(count) > 0)
            .sort((a, b) => b[1] - a[1])
            .slice(0, isTagMode ? 16 : 10);
        const distributionLabels = distributionPairs.length ? distributionPairs.map(([label]) => label) : ['No Data'];
        const distributionValues = distributionPairs.length ? distributionPairs.map(([, count]) => count) : [0];
        ChartUtils.createChart(`${prefix}distributionChart`, `${prefix}distribution`, 'bar', distributionLabels, [{
            label: isTagMode ? 'Entries per Tag' : 'Entries per Genre',
            data: distributionValues,
            backgroundColor: isTagMode ? 'rgba(54, 162, 235, 0.72)' : ChartUtils.Colors.PRIMARY,
            borderColor: isTagMode ? 'rgba(54, 162, 235, 0.95)' : 'rgba(75, 0, 130, 0.95)',
            borderWidth: 1
        }], {
            indexAxis: isTagMode ? 'y' : 'x',
            scales: isTagMode ? {
                x: { beginAtZero: true, max: axisMax(distributionValues), ticks: { color: '#9dc8f3', precision: 0 }, grid: { color: '#444' } },
                y: { ticks: { color: '#ddd', autoSkip: false }, grid: { color: 'rgba(68,68,68,0.45)' } }
            } : {
                x: { ticks: { color: '#ddd', autoSkip: false, maxRotation: 35 }, grid: { color: '#444' } },
                y: { beginAtZero: true, max: axisMax(distributionValues), ticks: { color: '#aaa', precision: 0 }, grid: { color: '#444' } }
            },
            plugins: { legend: { display: false } }
        });

        const topGenres = StatsCalc.calcTopGenres ? StatsCalc.calcTopGenres(entries, 6) : [];
        ChartUtils.createChart(`${prefix}radarChart`, `${prefix}radar`, 'radar',
            topGenres.length ? topGenres.map(item => item.genre) : ['No Data'],
            [{
                label: 'Genre Density',
                data: topGenres.length ? topGenres.map(item => item.count) : [0],
                backgroundColor: 'rgba(0, 212, 255, 0.18)',
                borderColor: 'rgba(0, 212, 255, 0.95)'
            }], {
                scales: { r: { beginAtZero: true, ticks: { color: '#9ecae6', backdropColor: 'transparent', precision: 0 }, grid: { color: '#444' }, angleLines: { color: '#444' }, pointLabels: { color: '#d9d9d9' } } },
                plugins: { legend: { display: false } }
            }
        );

        const personalDist = StatsCalc.calcRatingDistribution ? StatsCalc.calcRatingDistribution(entries) : {};
        const unifiedDist = StatsCalc.calcUnifiedRatingDistribution ? StatsCalc.calcUnifiedRatingDistribution(entries) : {};
        const ratingLabels = Array.from({ length: 10 }, (_, index) => String(index + 1));
        const personalValues = ratingLabels.map(label => Number(personalDist[label] || 0));
        const unifiedValues = ratingLabels.map(label => Number(unifiedDist[label] || 0));
        ChartUtils.createChart(`${prefix}ratingChart`, `${prefix}rating`, 'bar', ratingLabels, [
            { label: 'Personal', data: personalValues, backgroundColor: 'rgba(153, 102, 255, 0.62)', borderColor: 'rgba(153, 102, 255, 0.95)' },
            { type: 'line', label: 'Unified', data: unifiedValues, borderColor: 'rgba(0, 212, 255, 0.95)', backgroundColor: 'rgba(0, 212, 255, 0.2)', yAxisID: 'y', tension: 0.28, pointRadius: 2 }
        ], {
            scales: { x: { ticks: { color: '#ddd' }, grid: { color: '#444' } }, y: { beginAtZero: true, max: axisMax([...personalValues, ...unifiedValues]), ticks: { color: '#c6a6ff', precision: 0 }, grid: { color: '#444' } } }
        });

        const yearCounts = StatsCalc.calcPublicationYearCounts ? StatsCalc.calcPublicationYearCounts(entries) : {};
        const years = Object.keys(yearCounts).map(value => Number(value)).filter(Number.isFinite).sort((a, b) => a - b);
        let yearLabels = [];
        let yearValues = [];
        if (!years.length) {
            yearLabels = ['No Data'];
            yearValues = [0];
        } else if (years.length <= 16) {
            yearLabels = years.map(year => String(year));
            yearValues = years.map(year => Number(yearCounts[String(year)] || 0));
        } else {
            const decades = {};
            years.forEach(year => {
                const label = `${Math.floor(year / 10) * 10}s`;
                decades[label] = (decades[label] || 0) + Number(yearCounts[String(year)] || 0);
            });
            yearLabels = Object.keys(decades).sort((a, b) => Number(a.slice(0, 4)) - Number(b.slice(0, 4)));
            yearValues = yearLabels.map(label => decades[label]);
        }
        ChartUtils.createChart(`${prefix}publicationChart`, `${prefix}publication`, 'bar', yearLabels, [{
            label: 'Entries by Publication Year',
            data: yearValues,
            backgroundColor: 'rgba(255, 159, 64, 0.68)',
            borderColor: 'rgba(255, 159, 64, 0.95)'
        }], {
            scales: { x: { ticks: { color: '#ddd' }, grid: { color: '#444' } }, y: { beginAtZero: true, max: axisMax(yearValues), ticks: { color: '#ffc68f', precision: 0 }, grid: { color: '#444' } } },
            plugins: { legend: { display: false } }
        });

        const funnel = StatsCalc.calcBacklogFunnel ? StatsCalc.calcBacklogFunnel(entries) : {};
        const funnelLabels = ['Planned', 'In Progress', 'Completed', 'Paused', 'Dropped'];
        const funnelValues = [funnel.planned || 0, funnel.inProgress || 0, funnel.completed || 0, funnel.paused || 0, funnel.dropped || 0];
        ChartUtils.createChart(`${prefix}funnelChart`, `${prefix}funnel`, 'bar', funnelLabels, [{
            label: 'Entries',
            data: funnelValues,
            backgroundColor: ['#8ad1ff', '#6db1ff', '#82e39f', '#ffcc7a', '#ff8a8a'],
            borderColor: ['#8ad1ff', '#6db1ff', '#82e39f', '#ffcc7a', '#ff8a8a'],
            borderWidth: 1
        }], {
            indexAxis: 'y',
            scales: {
                x: { beginAtZero: true, max: axisMax(funnelValues), ticks: { color: '#ddd', precision: 0 }, grid: { color: '#444' } },
                y: { ticks: { color: '#ddd' }, grid: { color: 'rgba(68,68,68,0.4)' } }
            },
            plugins: { legend: { display: false } }
        });

        const demoCounts = StatsCalc.calcDemographicCounts ? StatsCalc.calcDemographicCounts(entries) : {};
        const demoPairs = Object.entries(demoCounts).sort((a, b) => b[1] - a[1]);
        const demoLabels = demoPairs.length ? demoPairs.map(([label]) => label) : ['No Data'];
        const demoValues = demoPairs.length ? demoPairs.map(([, count]) => count) : [0];
        ChartUtils.createChart(`${prefix}demographicChart`, `${prefix}demographic`, 'bar', demoLabels, [{
            label: 'Entries',
            data: demoValues,
            backgroundColor: 'rgba(75, 192, 192, 0.66)',
            borderColor: 'rgba(75, 192, 192, 0.95)',
            borderWidth: 1
        }], {
            indexAxis: 'y',
            scales: {
                x: { beginAtZero: true, max: axisMax(demoValues), ticks: { color: '#a9e8e8', precision: 0 }, grid: { color: '#444' } },
                y: { ticks: { color: '#ddd' }, grid: { color: 'rgba(68,68,68,0.4)' } }
            },
            plugins: { legend: { display: false } }
        });

        const habits = StatsCalc.calcDailyReadingHabits ? StatsCalc.calcDailyReadingHabits(entries, 30) : { labels: [], activityCounts: [], progressTotals: [] };
        const habitLabels = habits.labels?.length ? habits.labels : ['No Data'];
        const habitActivity = habits.activityCounts?.length ? habits.activityCounts : [0];
        const habitProgress = habits.progressTotals?.length ? habits.progressTotals : [0];
        ChartUtils.createChart(`${prefix}habitsChart`, `${prefix}habits`, 'line', habitLabels, [
            { label: 'Entries Updated', data: habitActivity, borderColor: 'rgba(130,227,159,0.95)', backgroundColor: 'rgba(130,227,159,0.2)', fill: true, tension: 0.28, yAxisID: 'y' },
            { label: 'Chapters / Episodes Read', data: habitProgress, borderColor: 'rgba(255,159,64,0.95)', backgroundColor: 'rgba(255,159,64,0.2)', fill: false, tension: 0.28, yAxisID: 'y1' }
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
            label: 'Chapters Read',
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
                x: { beginAtZero: true, ticks: { color: '#ddd', precision: 0 }, title: { display: true, text: 'Chapters / Episodes Read', color: '#b7dfff' }, grid: { color: '#444' } },
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

    window.EveLibrary.StatsRendererCharts = {
        renderCharts
    };
})();
