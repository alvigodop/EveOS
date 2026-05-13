// --- Data Transfer Backup Mismatch Report Core ---
window.EveDataTransfer = window.EveDataTransfer || {};

(function () {
    const ns = window.EveDataTransfer;
    if (ns.backupMismatchReportCoreReady) return;

    function text(value, fallback = '') {
        const raw = String(value == null ? '' : value).trim();
        return raw || String(fallback || '').trim();
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function getLinkApi() {
        return window.EveOS?.NebulaJsonLink
            || window.EveOS?.SearchAdvanced?.NebulaJsonLink
            || window.NebulaJsonLink
            || null;
    }

    function normalizeWorkspaceId(value) {
        return text(value, 'main');
    }

    function normalizeCategoryName(value) {
        return text(value, 'Unsorted');
    }

    function normalizeId(value) {
        return text(value, '');
    }

    function scopedKey(workspaceId, categoryName) {
        return `${normalizeWorkspaceId(workspaceId)}::${normalizeCategoryName(categoryName)}`;
    }

    function inferTypeFromPayload(payload) {
        const schema = text(payload?.schema, '').toLowerCase();
        if (schema.includes('bookmark-folder')) return 'folder';
        if (schema.includes('bookmark')) return 'bookmark';
        if (schema.includes('card')) return 'card';
        if (schema.includes('tab') || schema.includes('workspace')) return 'workspace';
        if (payload?.bookmark && typeof payload.bookmark === 'object') return 'bookmark';
        if (payload?.folderId || payload?.parentId) return 'folder';
        if (payload?.categoryName || payload?.bookmarkFolder) return 'card';
        if (payload?.id || payload?.entityId) return 'workspace';
        return '';
    }

    function parseEntityLink(entityLink) {
        const api = getLinkApi();
        return api?.parseLink ? api.parseLink(entityLink) : null;
    }

    function createEntityLink(source) {
        const api = getLinkApi();
        return api?.createLink ? api.createLink(source) : '';
    }

    function validateEntityLink(entityLink) {
        const api = getLinkApi();
        if (!api?.validateLink) return { ok: false, errors: ['link_validator_unavailable'], warnings: [] };
        return api.validateLink(entityLink);
    }

    function buildFallbackSource(payload, parsed) {
        const type = inferTypeFromPayload(payload) || parsed?.type || '';
        const bookmark = payload?.bookmark && typeof payload.bookmark === 'object' ? payload.bookmark : {};
        return {
            type,
            workspaceId: normalizeWorkspaceId(payload?.workspaceId || bookmark.workspace || parsed?.workspaceId),
            categoryName: normalizeCategoryName(
                payload?.categoryName
                || bookmark.category
                || (type === 'card' ? (payload?.entityId || payload?.id || payload?.name || payload?.title) : '')
                || parsed?.categoryName
            ),
            folderId: normalizeId(
                payload?.folderId
                || (type === 'folder' ? (payload?.entityId || payload?.id) : '')
                || bookmark.folderId
                || parsed?.folderId
            ),
            bookmarkId: normalizeId(
                payload?.bookmarkId
                || bookmark.id
                || (type === 'bookmark' ? payload?.entityId : '')
                || parsed?.bookmarkId
            )
        };
    }

    function makeRecord(path, payload) {
        const entityLink = text(payload?.entityLink, '');
        const parsed = entityLink ? parseEntityLink(entityLink) : null;
        const fallbackSource = buildFallbackSource(payload, parsed);
        const fallbackLink = createEntityLink(fallbackSource);
        return {
            path,
            schema: text(payload?.schema, ''),
            entityLink,
            fallbackLink,
            fallbackSource,
            parsed,
            type: parsed?.ok ? parsed.type : fallbackSource.type,
            entityId: text(payload?.entityId || payload?.id || payload?.bookmark?.id, ''),
            displayName: text(payload?.displayName || payload?.name || payload?.title || payload?.bookmark?.title, ''),
            payload,
            issues: [],
            validation: null,
            fallbackValidation: null,
            severity: 'healthy',
            status: 'Healthy'
        };
    }

    function addIssue(record, code, severity, label, detail = '') {
        record.issues.push({ code, severity, label, detail: text(detail, '') });
    }

    function addReportIssue(report, code, severity, label, detail = '') {
        report.issues.push({ code, severity, label, detail: text(detail, '') });
    }

    function compareMeta(record) {
        const parsed = record.parsed?.ok ? record.parsed : null;
        if (!parsed) return;
        const payload = record.payload || {};
        const bookmark = payload.bookmark && typeof payload.bookmark === 'object' ? payload.bookmark : {};

        const actualWorkspace = text(payload.workspaceId || bookmark.workspace, '');
        if (actualWorkspace && actualWorkspace !== parsed.workspaceId) {
            addIssue(record, 'backup_metadata_workspace_mismatch', 'warning', 'Backup metadata workspace does not match entity link.', `${actualWorkspace} -> ${parsed.workspaceId}`);
        }

        const actualCategory = text(payload.categoryName || bookmark.category, '');
        if (actualCategory && parsed.categoryName && actualCategory !== parsed.categoryName) {
            addIssue(record, 'backup_metadata_card_mismatch', 'warning', 'Backup metadata card does not match entity link.', `${actualCategory} -> ${parsed.categoryName}`);
        }

        if (record.type === 'folder') {
            const actualFolderId = text(payload.folderId || payload.entityId || payload.id, '');
            if (actualFolderId && actualFolderId !== parsed.folderId) {
                addIssue(record, 'backup_metadata_folder_mismatch', 'warning', 'Backup folder ID does not match entity link.', `${actualFolderId} -> ${parsed.folderId}`);
            }
        }

        if (record.type === 'bookmark') {
            const actualBookmarkId = text(payload.bookmarkId || payload.entityId || bookmark.id, '');
            if (actualBookmarkId && actualBookmarkId !== parsed.bookmarkId) {
                addIssue(record, 'backup_metadata_bookmark_mismatch', 'warning', 'Backup bookmark ID does not match entity link.', `${actualBookmarkId} -> ${parsed.bookmarkId}`);
            }
            const actualFolderId = text(bookmark.folderId || payload.folderId, '');
            if (actualFolderId && parsed.folderId && actualFolderId !== parsed.folderId) {
                addIssue(record, 'backup_metadata_bookmark_folder_mismatch', 'warning', 'Backup bookmark folder does not match entity link.', `${actualFolderId} -> ${parsed.folderId}`);
            }
        }
    }

    function getRecordIdentity(record) {
        const parsed = record.parsed?.ok ? record.parsed : record.fallbackSource;
        if (!parsed?.type) return '';
        if (parsed.type === 'workspace') return `workspace::${parsed.workspaceId}`;
        if (parsed.type === 'card') return `card::${parsed.workspaceId}::${parsed.categoryName}`;
        if (parsed.type === 'folder') return `folder::${parsed.workspaceId}::${parsed.categoryName}::${parsed.folderId}`;
        if (parsed.type === 'bookmark') return `bookmark::${parsed.workspaceId}::${parsed.categoryName}::${parsed.folderId || '__root__'}::${parsed.bookmarkId}`;
        return '';
    }

    function getRecordScope(record) {
        const parsed = record.parsed?.ok ? record.parsed : record.fallbackSource;
        return {
            workspaceId: normalizeWorkspaceId(parsed?.workspaceId),
            categoryName: normalizeCategoryName(parsed?.categoryName),
            folderId: normalizeId(parsed?.folderId),
            bookmarkId: normalizeId(parsed?.bookmarkId)
        };
    }

    function classifyRecord(record) {
        if (!record.entityLink) {
            addIssue(record, 'missing_entity_link', 'warning', 'Backup entity has no stable eve:// link.', record.fallbackLink ? 'Path/name fallback is available.' : 'No fallback link could be built.');
        } else {
            record.validation = validateEntityLink(record.entityLink);
            if (!record.validation?.ok) {
                (record.validation?.errors || []).forEach((error) => {
                    addIssue(record, error, 'broken', 'Live state does not resolve this backup entity link.', error);
                });
            }
            (record.validation?.warnings || []).forEach((warning) => {
                addIssue(record, warning, 'warning', 'Live state resolves this link with a mismatch warning.', warning);
            });
            if (record.parsed?.ok && record.parsed.canonical && record.parsed.canonical !== record.entityLink) {
                addIssue(record, 'non_canonical_entity_link', 'warning', 'Entity link is valid but not canonical.', record.parsed.canonical);
            }
        }

        if (record.fallbackLink && record.fallbackLink !== record.entityLink) {
            record.fallbackValidation = validateEntityLink(record.fallbackLink);
            if (!record.validation?.ok && record.fallbackValidation?.ok) {
                addIssue(record, 'stale_link_recoverable_by_metadata', 'warning', 'Broken entity link can be recovered by backup metadata fallback.', record.fallbackLink);
            } else if (record.validation?.ok && record.fallbackValidation?.ok) {
                const rawResolution = record.validation?.resolution?.link || '';
                const fallbackResolution = record.fallbackValidation?.resolution?.link || '';
                if (rawResolution && fallbackResolution && rawResolution !== fallbackResolution) {
                    addIssue(record, 'backup_metadata_points_elsewhere', 'warning', 'Backup metadata fallback resolves to a different live entity.', record.fallbackLink);
                }
            }
        }
        compareMeta(record);
    }

    function addInternalBackupIssues(records, report) {
        const folderKeys = new Set();
        const folderParentChecks = [];
        const linkPaths = new Map();
        const identityPaths = new Map();

        records.forEach((record) => {
            const identity = getRecordIdentity(record);
            if (identity) {
                if (!identityPaths.has(identity)) identityPaths.set(identity, []);
                identityPaths.get(identity).push(record);
            }
            if (record.entityLink) {
                if (!linkPaths.has(record.entityLink)) linkPaths.set(record.entityLink, []);
                linkPaths.get(record.entityLink).push(record);
            }
            if (record.type === 'folder') {
                const scope = getRecordScope(record);
                if (!scope.folderId) return;
                folderKeys.add(`${scopedKey(scope.workspaceId, scope.categoryName)}::${scope.folderId}`);
                const parentId = text(record.payload?.parentId, '');
                if (parentId) folderParentChecks.push({ record, scope, parentId });
            }
        });

        linkPaths.forEach((bucket, link) => {
            if (bucket.length < 2) return;
            bucket.forEach((record) => addIssue(record, 'duplicate_entity_link_in_backup', 'warning', 'Multiple backup files point at the same entity link.', `${bucket.length} files share ${link}`));
        });
        identityPaths.forEach((bucket, identity) => {
            if (bucket.length < 2) return;
            bucket.forEach((record) => addIssue(record, 'duplicate_entity_identity_in_backup', 'warning', 'Multiple backup files share the same entity identity.', `${bucket.length} files share ${identity}`));
        });
        folderParentChecks.forEach(({ record, scope, parentId }) => {
            if (parentId === scope.folderId) {
                addIssue(record, 'backup_folder_parent_self_cycle', 'broken', 'Backup folder points to itself as parent.', parentId);
            } else if (!folderKeys.has(`${scopedKey(scope.workspaceId, scope.categoryName)}::${parentId}`)) {
                addIssue(record, 'backup_folder_parent_missing', 'broken', 'Backup folder parent is missing from the selected backup.', parentId);
            }
        });
        records.forEach((record) => {
            if (record.type !== 'bookmark') return;
            const scope = getRecordScope(record);
            const backupFolderId = text(record.payload?.bookmark?.folderId || record.payload?.folderId || scope.folderId, '');
            if (backupFolderId && !folderKeys.has(`${scopedKey(scope.workspaceId, scope.categoryName)}::${backupFolderId}`)) {
                addIssue(record, 'backup_bookmark_folder_missing', 'broken', 'Backup bookmark references a folder that is not in the selected backup.', backupFolderId);
            }
        });
    }

    function addManifestIssues(report) {
        const manifestCounts = report.manifest?.dataPack || null;
        if (!manifestCounts || typeof manifestCounts !== 'object') return;
        [
            ['bookmarks', 'bookmark', 'manifest_bookmark_count_mismatch', 'Manifest bookmark count differs from scanned entity files.'],
            ['cards', 'card', 'manifest_card_count_mismatch', 'Manifest card count differs from scanned entity files.'],
            ['tabs', 'workspace', 'manifest_tab_count_mismatch', 'Manifest tab count differs from scanned entity files.']
        ].forEach(([manifestKey, countKey, code, label]) => {
            const expected = Number(manifestCounts[manifestKey]);
            if (Number.isFinite(expected) && expected !== report.counts[countKey]) {
                addReportIssue(report, code, 'warning', label, `${expected} expected, ${report.counts[countKey]} scanned`);
            }
        });
    }

    function finalizeRecord(record) {
        const hasBroken = record.issues.some((issue) => issue.severity === 'broken');
        const hasWarnings = record.issues.some((issue) => issue.severity === 'warning');
        record.severity = hasBroken ? 'broken' : (hasWarnings ? 'warning' : 'healthy');
        record.status = record.severity === 'broken' ? 'Broken' : (record.severity === 'warning' ? 'Needs Review' : 'Healthy');
        return record;
    }

    function buildBackupMismatchReportFromRecords(records, meta = {}) {
        const report = {
            ok: true,
            generatedAt: new Date().toISOString(),
            rootName: text(meta.rootName || meta.name, ''),
            scannedFiles: Number(meta.scannedFiles || 0),
            manifest: meta.manifest || null,
            stateFiles: Array.isArray(meta.stateFiles) ? meta.stateFiles : [],
            counts: { workspace: 0, card: 0, folder: 0, bookmark: 0, healthy: 0, warning: 0, broken: 0, recoverable: 0 },
            issues: [],
            records: []
        };

        (Array.isArray(records) ? records : []).forEach((record) => {
            classifyRecord(record);
            report.counts[record.type] = Number(report.counts[record.type] || 0) + 1;
        });
        addInternalBackupIssues(records, report);
        addManifestIssues(report);

        report.records = records.map(finalizeRecord);
        report.records.forEach((record) => {
            report.counts[record.severity] = Number(report.counts[record.severity] || 0) + 1;
            if (record.issues.some((issue) => issue.code === 'stale_link_recoverable_by_metadata')) report.counts.recoverable += 1;
        });
        report.issues.forEach((issue) => {
            if (issue.severity === 'broken' || issue.severity === 'warning') {
                report.counts[issue.severity] = Number(report.counts[issue.severity] || 0) + 1;
            }
        });
        report.ok = !(report.issues.some((issue) => issue.severity === 'broken') || report.counts.broken > 0);
        return report;
    }

    ns.BackupMismatchReportCore = {
        text,
        escapeHtml,
        makeRecord,
        buildBackupMismatchReportFromRecords
    };
    ns.buildBackupMismatchReportFromRecords = buildBackupMismatchReportFromRecords;
    ns.backupMismatchReportCoreReady = true;
})();
