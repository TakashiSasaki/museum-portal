/*
 * Temporarily suppresses the dummy event feed rendered by index.js.
 *
 * This keeps the signage page structure and existing clock/timer/calendar code intact
 * while preventing placeholder events from being shown. Replace this file or remove its
 * script tag when the real event data source is implemented.
 */
function disableDummyEvents() {
    try {
        if (typeof allNotices !== 'undefined') {
            allNotices = [];
        }

        const noticeList = document.getElementById('notice-list');
        if (noticeList) {
            noticeList.innerHTML = '';
        }

        const pageIndicator = document.getElementById('notice-page-indicator');
        if (pageIndicator) {
            pageIndicator.textContent = '0 / 0';
        }

        const upcomingEventAlert = document.getElementById('upcoming-event-alert');
        if (upcomingEventAlert) {
            upcomingEventAlert.innerHTML = '';
            upcomingEventAlert.style.display = 'none';
        }

        if (typeof renderCalendar === 'function' && typeof currentYear !== 'undefined' && typeof currentMonth !== 'undefined') {
            renderCalendar(currentYear, currentMonth);
        }
    } catch (error) {
        console.error('Failed to disable dummy events:', error);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', disableDummyEvents);
} else {
    disableDummyEvents();
}
