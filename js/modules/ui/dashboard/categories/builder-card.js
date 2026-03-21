window.DashboardCategories = window.DashboardCategories || {};

(function () {
    var api = window.DashboardCategories._builderCard = window.DashboardCategories._builderCard || {};

    window.DashboardCategories.renderCard = api.renderCard;
    window.DashboardCategories.getCardHeaderButtonsForCategory = api.getCardHeaderButtonsForCategory;
    window.DashboardCategories.setCardHeaderButtonsForCategory = api.setCardHeaderButtonsForCategory;
    window.DashboardCategories.cardHeaderButtonOptions = (api.DEFAULT_CARD_HEADER_BUTTONS || []).slice();
    window.showCardTitleHover = api.showCardTitleHover;
    window.moveCardTitleHover = api.moveCardTitleHover;
    window.hideCardTitleHover = api.hideCardTitleHover;
    window.handleCardHeaderIconRowWheel = api.handleCardHeaderIconRowWheel;
    window.toggleCategoryCardFolderActions = api.toggleCategoryCardFolderActions;
})();
