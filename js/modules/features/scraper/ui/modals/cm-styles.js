/**
 * Confirm Modal Styles
 * Contains CSS definitions and style injection logic.
 */
(function () {
    window.ConfirmModalStyles = {
        /**
         * Ensure animation keyframes are present in the document
         */
        ensureKeyframes: function () {
            if (!document.getElementById('modal-keyframes')) {
                const style = document.createElement('style');
                style.id = 'modal-keyframes';
                style.textContent = `
                    @keyframes modalFadeIn {
                        from { opacity: 0; }
                        to { opacity: 1; }
                    }
                    @keyframes modalSlideIn {
                        from { opacity: 0; transform: scale(0.9) translateY(-20px); }
                        to { opacity: 1; transform: scale(1) translateY(0); }
                    }
                `;
                document.head.appendChild(style);
            }
        },

        // CSS for the modal overlay
        overlayCss: `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.6);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 999999;
            animation: modalFadeIn 0.2s ease;
        `,

        // CSS for the modal content box
        contentCss: `
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            border-radius: 16px;
            padding: 32px;
            max-width: 420px;
            width: 90%;
            box-shadow: 0 20px 60px rgba(0,0,0,0.5);
            border: 1px solid rgba(255,255,255,0.1);
            text-align: center;
            animation: modalSlideIn 0.3s ease;
        `,

        // Button background styles
        buttonGradients: {
            danger: 'linear-gradient(135deg, #e74c3c 0%, #c0392b 100%)',
            primary: 'linear-gradient(135deg, #3498db 0%, #2980b9 100%)',
            success: 'linear-gradient(135deg, #27ae60 0%, #219a52 100%)'
        }
    };
})();
