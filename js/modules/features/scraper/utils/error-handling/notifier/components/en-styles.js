/**
 * Error Notifier Styles
 * Contains the CSS for the Error Notifier component
 */
const ErrorNotifierStyles = {
    /**
     * Get the CSS styles string
     * @returns {string} The CSS styles
     */
    getStyles: function () {
        return `
            #error-notifier-container {
                position: fixed;
                bottom: 20px;
                right: 20px;
                z-index: 9999;
                max-width: 400px;
                width: 100%;
                display: flex;
                flex-direction: column;
                gap: 10px;
                font-family: Arial, sans-serif;
            }
            
            .error-notification {
                background-color: #fff;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                overflow: hidden;
                opacity: 0;
                transform: translateY(20px);
                transition: opacity 0.3s, transform 0.3s;
                border-left: 4px solid #e53935;
            }
            
            .error-notification-visible {
                opacity: 1;
                transform: translateY(0);
            }
            
            .error-notification-hiding {
                opacity: 0;
                transform: translateY(20px);
            }
            
            .error-notification-header {
                background-color: #f8f8f8;
                padding: 12px 16px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                border-bottom: 1px solid #eee;
            }
            
            .error-notification-header h3 {
                margin: 0;
                font-size: 16px;
                color: #333;
            }
            
            .error-notification-close {
                background: none;
                border: none;
                font-size: 20px;
                cursor: pointer;
                color: #888;
                padding: 0;
                width: 24px;
                height: 24px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 50%;
            }
            
            .error-notification-close:hover {
                background-color: rgba(0, 0, 0, 0.1);
                color: #333;
            }
            
            .error-notification-content {
                padding: 16px;
            }
            
            .error-notification-message {
                margin: 0 0 12px 0;
                color: #333;
                line-height: 1.5;
            }
            
            .error-notification-tips {
                margin: 0;
                padding-left: 20px;
                color: #666;
                font-size: 14px;
            }
            
            .error-notification-tips li {
                margin-bottom: 8px;
                line-height: 1.4;
            }
            
            .error-notification-actions {
                padding: 0 16px 16px;
                display: flex;
                justify-content: flex-end;
            }
            
            .error-notification-fix {
                background-color: #4285f4;
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: 4px;
                cursor: pointer;
                font-weight: 500;
                transition: background-color 0.2s;
            }
            
            .error-notification-fix:hover {
                background-color: #3367d6;
            }
            
            .error-notification-fix:disabled {
                background-color: #ccc;
                cursor: not-allowed;
            }
            
            /* Dark mode */
            @media (prefers-color-scheme: dark) {
                .error-notification {
                    background-color: #222;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                }
                
                .error-notification-header {
                    background-color: #333;
                    border-bottom: 1px solid #444;
                }
                
                .error-notification-header h3 {
                    color: #fff;
                }
                
                .error-notification-close {
                    color: #aaa;
                }
                
                .error-notification-close:hover {
                    background-color: rgba(255, 255, 255, 0.1);
                    color: #fff;
                }
                
                .error-notification-message {
                    color: #eee;
                    margin-bottom: 12px;
                }
                
                .error-notification-tips {
                    color: #bbb;
                }
            }
        `;
    }
};

window.ErrorNotifierStyles = ErrorNotifierStyles;
