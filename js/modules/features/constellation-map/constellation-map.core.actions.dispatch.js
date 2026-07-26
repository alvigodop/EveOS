window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const shared = ns._shared || {};
    const view = ns._view || {};
    const helpers = ns._coreActionHelpers || {};
    const create = ns._coreActionCreate || {};
    const wheel = ns._coreActionWheel || {};
    const navigate = ns._coreActionNavigate || {};

    const { state, getConfig, text } = shared;
    const { centerOnNode } = view;
    const { getPrimaryAction, getNodeTargetSpec } = helpers;
    const { closeActionWheel } = wheel;
    const { createFolderFromNode, createCardAndAttachFromWorkspace } = create;
    const { activateNode, openFolderFromMap, openCategorySettingsFromMap } = navigate;

    function runNodeAction(node, action) {
        if (!node || !action) return;

        closeActionWheel();

        if (action === 'primary') {
            const primaryAction = getPrimaryAction(node);
            if (primaryAction?.action && primaryAction.action !== 'primary') {
                runNodeAction(node, primaryAction.action);
                return;
            }
            activateNode(node);
            return;
        }

        if (action === 'open-link') {
            activateNode(node);
            return;
        }

        if (action === 'play-audio') {
            window.EveAudioflixLinks?.play?.(node.data?.audioType, node.data?.audioId)
                ?.catch?.((error) => console.warn('[Constellation] Audioflix playback failed.', error));
            return;
        }

        if (action === 'center') {
            centerOnNode(node, Math.max(state.transform.scale, 1.24));
            return;
        }

        if (action === 'open-category') {
            const data = node.data || {};
            if (data.categoryName) {
                if (data.workspaceId && typeof window.switchWorkspace === 'function' && String(getConfig().activeWorkspace || 'main') !== String(data.workspaceId)) {
                    window.switchWorkspace(data.workspaceId);
                }
                if (typeof window.setFocus === 'function') {
                    window.setFocus(data.categoryName);
                    ns.closeMap();
                }
            }
            return;
        }

        if (action === 'open-folder') {
            openFolderFromMap(node);
            return;
        }

        if (action === 'open-workspace') {
            activateNode(node);
            return;
        }

        if (action === 'arm-rewire') {
            if (typeof ns._armConstellationRewireNode === 'function') {
                ns._armConstellationRewireNode(node);
            }
            return;
        }

        if (action === 'cancel-rewire') {
            if (typeof ns._cancelConstellationRewire === 'function') {
                ns._cancelConstellationRewire();
            }
            return;
        }

        if (action === 'detach-to-root') {
            if (typeof ns._detachConstellationNodeToRoot === 'function') {
                ns._detachConstellationNodeToRoot(node);
            }
            return;
        }

        if (action === 'detach-to-parking') {
            if (typeof ns._detachConstellationNodeToParking === 'function') {
                ns._detachConstellationNodeToParking(node);
            }
            return;
        }

        if (action === 'attach-here') {
            const targetSpec = getNodeTargetSpec(node);
            if (targetSpec && typeof ns._commitConstellationRewireTarget === 'function') {
                ns._commitConstellationRewireTarget(targetSpec, {
                    snapToTargetNodeId: text(node.id, ''),
                    silent: false
                });
            }
            return;
        }

        if (action === 'create-folder') {
            createFolderFromNode(node, { attachArmedSource: true });
            return;
        }

        if (action === 'create-card-attach') {
            createCardAndAttachFromWorkspace(node);
            return;
        }

        if (action === 'open-category-settings') {
            openCategorySettingsFromMap(node);
        }
    }

    ns._coreActionDispatch = Object.assign(ns._coreActionDispatch || {}, {
        runNodeAction
    });
})(window.EveConstellationMap);
