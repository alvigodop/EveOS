/**
 * Chart Utils for Eve OS Library
 * Helper functions for creating charts
 * Adapted from MegaBase chart-utils.js
 */
window.EveLibrary = window.EveLibrary || {};

(function () {
    const Colors = {
        PRIMARY: 'rgba(75, 0, 130, 0.7)', // Indigo
        SECONDARY: 'rgba(255, 99, 132, 0.7)',
        TERTIARY: 'rgba(54, 162, 235, 0.7)',
        QUATERNARY: 'rgba(255, 206, 86, 0.7)',
        Background: 'rgba(255, 255, 255, 0.1)',
        Border: 'rgba(255, 255, 255, 0.2)'
    };

    const chartInstances = {};

    function generateColors(count) {
        const colors = [];
        for (let i = 0; i < count; i++) {
            const hue = (i * 137.508) % 360; // Golden angle approximation
            colors.push(`hsla(${hue}, 60%, 65%, 0.7)`);
        }
        return colors;
    }

    function createChart(canvasId, instanceId, type, labels, datasets, options = {}) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;

        // Destroy existing chart if it exists
        if (chartInstances[instanceId]) {
            chartInstances[instanceId].destroy();
        }

        const defaultOptions = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#e0e0e0' } },
                title: { color: '#e0e0e0', display: !!datasets[0].label, text: datasets[0].label }
            },
            scales: (type === 'bar' || type === 'line') ? {
                x: { ticks: { color: '#aaa' }, grid: { color: '#444' } },
                y: { ticks: { color: '#aaa' }, grid: { color: '#444' }, beginAtZero: true }
            } : {}
        };

        const config = {
            type: type,
            data: { labels, datasets },
            options: { ...defaultOptions, ...options }
        };

        chartInstances[instanceId] = new Chart(ctx, config);
    }

    window.EveLibrary.ChartUtils = {
        Colors,
        generateColors,
        createChart
    };
})();
