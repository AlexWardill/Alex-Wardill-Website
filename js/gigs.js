(() => {
    const upcomingGigs = document.querySelectorAll('.upcoming-gig');

    upcomingGigs.forEach((gig) => {
        const ticketLink = gig.getAttribute('data-ticket-link')?.trim();

        if (!ticketLink) {
            return;
        }

        const venue = gig.querySelector('.gig-venue')?.textContent?.trim();
        gig.classList.add('gig-item-clickable');
        gig.setAttribute('tabindex', '0');
        gig.setAttribute('role', 'link');
        gig.setAttribute('aria-label', venue ? `Open ticket link for ${venue}` : 'Open ticket link');

        const openTicketLink = () => {
            window.open(ticketLink, '_blank', 'noopener,noreferrer');
        };

        gig.addEventListener('click', openTicketLink);
        gig.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openTicketLink();
            }
        });
    });
})();
