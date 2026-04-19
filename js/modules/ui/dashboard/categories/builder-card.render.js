window.DashboardCategories = window.DashboardCategories || {};

(function () {
    var api = window.DashboardCategories._builderCard = window.DashboardCategories._builderCard || {};
    if (!api.cardRenderRoutesReady || !api.cardRenderProgressiveReady || !api.cardRenderFullReady || !api.cardRenderDeferredReady) {
        console.warn('DashboardCategories builder-card.render: runtime modules missing');
        return;
    }

    api.cardRenderReady = true;
})();
