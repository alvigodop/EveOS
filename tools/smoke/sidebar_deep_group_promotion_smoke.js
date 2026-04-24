const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function repoPath(relativePath) {
    return path.join(REPO_ROOT, relativePath);
}

function loadScript(context, relativePath) {
    const source = fs.readFileSync(repoPath(relativePath), 'utf8');
    vm.runInContext(source, context, { filename: relativePath });
}

function createRuntime() {
    const context = {
        console,
        setTimeout,
        clearTimeout
    };
    context.window = context;
    context.EveSidebarRuntime = { sharedReady: true };
    vm.createContext(context);

    [
        'js/modules/core/workspace-helpers.js',
        'js/modules/ui/sidebar-groups.shared.js',
        'js/modules/ui/sidebar-groups.order.js',
        'js/modules/ui/sidebar-groups.mutations.js',
        'js/modules/ui/sidebar-groups.js',
        'js/modules/ui/sidebar.runtime.interactions.js'
    ].forEach(scriptPath => loadScript(context, scriptPath));

    return context;
}

function seedConfig(context) {
    context.config = context.window.config = {
        activeWorkspace: 'groupTop',
        viewMode: 'grid',
        sidebarExpanded: true,
        sidebarOrderMode: 'manual',
        sidebarManualOrder: {
            root: ['group:groupA', 'workspace:outside'],
            parents: {
                grand: ['workspace:deep']
            }
        },
        sidebarGroups: [
            {
                id: 'groupA',
                name: 'Group A',
                color: '#00d4ff',
                collapsed: false,
                hidden: false,
                parentWorkspaceId: ''
            }
        ],
        collapsedTabs: [],
        showHiddenSidebarGroups: false,
        showInactiveTabs: false,
        workspaces: [
            {
                id: 'groupTop',
                name: 'Group Top',
                icon: 'G',
                groupId: 'groupA',
                subTabs: [
                    {
                        id: 'child',
                        name: 'Child',
                        icon: 'C',
                        subTabs: [
                            {
                                id: 'grand',
                                name: 'Grand',
                                icon: 'N',
                                subTabs: [
                                    {
                                        id: 'deep',
                                        name: 'Deep',
                                        icon: 'D',
                                        subTabs: [
                                            { id: 'deepChild', name: 'Deep Child', icon: 'd', subTabs: [] }
                                        ]
                                    }
                                ]
                            }
                        ]
                    }
                ]
            },
            {
                id: 'nextGroupTop',
                name: 'Next Group Top',
                icon: 'N',
                groupId: 'groupA',
                subTabs: []
            },
            {
                id: 'outside',
                name: 'Outside',
                icon: 'O',
                subTabs: []
            }
        ]
    };
}

function createInteractionContext(context, draggedWorkspaceId) {
    const runtime = context.EveSidebarRuntime;
    const groupsApi = context.EveSidebarGroups;
    const helpers = context.EveWorkspaceHelpers;
    const dragState = {
        type: 'workspace',
        id: draggedWorkspaceId,
        hoverWorkspaceId: '',
        didApply: false
    };
    const ctx = {
        getDraggedWorkspaceId() {
            return dragState.type === 'workspace' ? dragState.id : '';
        },
        getDraggedGroupId() {
            return dragState.type === 'group' ? dragState.id : '';
        },
        markWorkspaceDropApplied() {
            dragState.didApply = true;
        },
        wasWorkspaceDropApplied() {
            return !!dragState.didApply;
        },
        isManualSidebarOrder() {
            return groupsApi.getSidebarOrderMode(context.config) === 'manual';
        }
    };

    runtime.attachRenderInteractions(ctx, dragState, helpers, groupsApi);
    return { ctx, dragState };
}

function runSmoke() {
    const context = createRuntime();
    seedConfig(context);
    context.EveSidebarGroups.ensureConfigDefaults(context.config);

    const { ctx, dragState } = createInteractionContext(context, 'deep');
    if (!ctx.canMoveWorkspaceIntoGroup('deep', 'groupA')) {
        throw new Error('Expected deep sub-tab to be accepted by group drop target');
    }

    const moved = ctx.moveWorkspaceIntoGroup('deep', 'groupA', 'nextGroupTop');
    if (!moved || !dragState.didApply) {
        throw new Error('Expected deep sub-tab promotion into group to apply');
    }

    const helpers = context.EveWorkspaceHelpers;
    const groupsApi = context.EveSidebarGroups;
    const deep = helpers.findById(context.config.workspaces, 'deep');
    const grand = helpers.findById(context.config.workspaces, 'grand');
    const deepParent = helpers.findParent(context.config.workspaces, 'deep');
    const rootOrder = context.config.workspaces.map(workspace => workspace.id);
    const groupRoots = groupsApi.getGroupRoots('groupA', context.config).map(workspace => workspace.id);
    const grandManualOrder = context.config.sidebarManualOrder.parents.grand || [];

    const result = {
        rootOrder,
        groupRoots,
        deepGroupId: deep ? deep.groupId || '' : '',
        deepParentId: deepParent ? deepParent.id : '',
        grandChildren: grand && Array.isArray(grand.subTabs) ? grand.subTabs.map(workspace => workspace.id) : [],
        deepChildren: deep && Array.isArray(deep.subTabs) ? deep.subTabs.map(workspace => workspace.id) : [],
        grandManualOrder
    };

    if (rootOrder.join('|') !== 'groupTop|deep|nextGroupTop|outside') {
        throw new Error(`Unexpected root order after deep group promotion: ${JSON.stringify(result)}`);
    }
    if (groupRoots.join('|') !== 'groupTop|deep|nextGroupTop') {
        throw new Error(`Unexpected group root order after deep group promotion: ${JSON.stringify(result)}`);
    }
    if (!deep || deep.groupId !== 'groupA' || deepParent) {
        throw new Error(`Expected deep tab to become a root group member: ${JSON.stringify(result)}`);
    }
    if (result.grandChildren.length !== 0 || result.deepChildren.join('|') !== 'deepChild') {
        throw new Error(`Expected subtree to move intact out of old parent: ${JSON.stringify(result)}`);
    }
    if (grandManualOrder.includes('workspace:deep')) {
        throw new Error(`Expected stale nested manual order token to be removed: ${JSON.stringify(result)}`);
    }

    console.log('SIDEBAR_DEEP_GROUP_PROMOTION_SMOKE_OK');
    console.log(JSON.stringify(result, null, 2));
}

try {
    runSmoke();
} catch (error) {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
}
