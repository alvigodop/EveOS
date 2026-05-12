window.DashboardCategories = window.DashboardCategories || {};

(function () {
    var api = window.DashboardCategories._builderCard = window.DashboardCategories._builderCard || {};

    window.DashboardCategories.renderCard = api.renderCard;
    window.DashboardCategories.getCardHeaderButtonsForCategory = api.getCardHeaderButtonsForCategory;
    window.DashboardCategories.setCardHeaderButtonsForCategory = api.setCardHeaderButtonsForCategory;
    window.DashboardCategories.isCardBookmarkProgressiveRevealEnabled = api.isCardBookmarkProgressiveRevealEnabled;
    window.DashboardCategories.setCardBookmarkProgressiveRevealEnabled = api.setCardBookmarkProgressiveRevealEnabled;
    window.DashboardCategories.getFolderBookmarkProgressiveRevealMode = api.getFolderBookmarkProgressiveRevealMode;
    window.DashboardCategories.isFolderBookmarkProgressiveRevealEnabled = api.isFolderBookmarkProgressiveRevealEnabled;
    window.DashboardCategories.setFolderBookmarkProgressiveRevealMode = api.setFolderBookmarkProgressiveRevealMode;
    window.DashboardCategories.setFolderBookmarkProgressiveRevealEnabled = api.setFolderBookmarkProgressiveRevealEnabled;
    window.DashboardCategories.getFolderBookmarkProgressiveRevealOptions = api.getFolderBookmarkProgressiveRevealOptions;
    window.DashboardCategories.describeFolderBookmarkProgressiveRevealMode = api.describeFolderBookmarkProgressiveRevealMode;
    window.DashboardCategories.getCardDescription = api.getCardDescription;
    window.DashboardCategories.setCardDescription = api.setCardDescription;
    window.DashboardCategories.cardHeaderButtonOptions = (api.DEFAULT_CARD_HEADER_BUTTONS || []).slice();
    window.isCardBookmarkProgressiveRevealEnabled = api.isCardBookmarkProgressiveRevealEnabled;
    window.isFolderBookmarkProgressiveRevealEnabled = api.isFolderBookmarkProgressiveRevealEnabled;
    window.showCardTitleHover = api.showCardTitleHover;
    window.moveCardTitleHover = api.moveCardTitleHover;
    window.hideCardTitleHover = api.hideCardTitleHover;
    window.handleCardHeaderIconRowWheel = api.handleCardHeaderIconRowWheel;
    window.toggleCategoryCardFolderActions = api.toggleCategoryCardFolderActions;
})();
