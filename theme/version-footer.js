// ABOUTME: Injects version footer into mdBook pages
// ABOUTME: Reads version info from generated version.json file

(function() {
    'use strict';

    // Default values (will be overwritten by version.json if available)
    let versionInfo = {
        pierre_version: 'dev',
        commit_hash: 'unknown',
        commit_short: 'unknown',
        build_date: new Date().toISOString().split('T')[0],
        repo_url: 'https://github.com/Async-IO/pierre_mcp_server'
    };

    // Try to load version info from generated file
    fetch('./version.json')
        .then(response => response.json())
        .then(data => {
            versionInfo = { ...versionInfo, ...data };
            renderFooter();
        })
        .catch(() => {
            // If version.json doesn't exist (local dev), use defaults
            renderFooter();
        });

    function renderFooter() {
        // Don't add footer if already exists
        if (document.querySelector('.version-footer')) return;

        const footer = document.createElement('div');
        footer.className = 'version-footer';
        footer.innerHTML = `
            <span>
                <strong>Pierre</strong>
                <span class="version-badge">v${escapeHtml(versionInfo.pierre_version)}</span>
            </span>
            <span class="separator">|</span>
            <span>
                Built from
                <a href="${escapeHtml(versionInfo.repo_url)}/commit/${escapeHtml(versionInfo.commit_hash)}"
                   target="_blank"
                   rel="noopener noreferrer"
                   class="commit-hash"
                   title="View commit on GitHub">
                    ${escapeHtml(versionInfo.commit_short)}
                </a>
            </span>
            <span class="separator">|</span>
            <span>Updated: ${escapeHtml(versionInfo.build_date)}</span>
        `;

        document.body.appendChild(footer);
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
})();
