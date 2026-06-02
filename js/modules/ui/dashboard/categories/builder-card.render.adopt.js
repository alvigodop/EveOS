window.DashboardCategories = window.DashboardCategories || {};

(function () {
    var api = window.DashboardCategories._builderCard = window.DashboardCategories._builderCard || {};
    if (api.cardRenderAdoptReady) return;

    function adoptDeferredCardNode(targetCard, sourceCard) {
        if (!targetCard || !sourceCard) return sourceCard || targetCard;
        var preservedMinHeight = sourceCard.style.minHeight || targetCard.style.minHeight || '';
        var preservedIntrinsicSize = sourceCard.style.containIntrinsicSize || targetCard.style.containIntrinsicSize || '';
        var wasHeavyLayout = sourceCard.getAttribute('data-card-heavy-layout') === '1'
            || targetCard.getAttribute('data-card-heavy-layout') === '1';

        Array.from(targetCard.attributes || []).forEach(function (attr) { targetCard.removeAttribute(attr.name); });
        Array.from(sourceCard.attributes || []).forEach(function (attr) { targetCard.setAttribute(attr.name, attr.value); });
        targetCard.innerHTML = sourceCard.innerHTML;
        targetCard.ondragover = sourceCard.ondragover || null;
        targetCard.ondragenter = sourceCard.ondragenter || null;
        targetCard.ondragleave = sourceCard.ondragleave || null;
        targetCard.ondrop = sourceCard.ondrop || null;
        targetCard.style.cssText = sourceCard.style.cssText || '';
        targetCard.style.opacity = '1';
        targetCard.style.transition = '';
        if (preservedMinHeight) targetCard.style.minHeight = preservedMinHeight;
        if (preservedIntrinsicSize) targetCard.style.containIntrinsicSize = preservedIntrinsicSize;
        if (wasHeavyLayout) {
            targetCard.style.contentVisibility = 'visible';
            targetCard.setAttribute('data-card-heavy-layout', '1');
        }
        return targetCard;
    }

    api.adoptDeferredCardNode = adoptDeferredCardNode;
    api.cardRenderAdoptReady = true;
})();
