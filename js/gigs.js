(() => {
    function parseDisplayDateToIso(displayDate) {
        const match = displayDate
            ?.trim()
            .match(/^(\d{1,2})(?:st|nd|rd|th)\s+([A-Za-z]+)\s+(\d{4})$/i);

        if (!match) {
            return null;
        }

        const day = Number.parseInt(match[1], 10);
        const monthName = match[2].toLowerCase();
        const year = Number.parseInt(match[3], 10);
        const monthMap = {
            january: 1,
            february: 2,
            march: 3,
            april: 4,
            may: 5,
            june: 6,
            july: 7,
            august: 8,
            september: 9,
            october: 10,
            november: 11,
            december: 12,
        };

        const month = monthMap[monthName];
        if (!month || !day || !year) {
            return null;
        }

        return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    }

    function getGigLocation(venueText) {
        const splitIndex = venueText.indexOf('@');
        if (splitIndex === -1) {
            return venueText;
        }

        return venueText.slice(splitIndex + 1).trim() || venueText;
    }

    function buildGigsSchema(upcomingGigElements) {
        const events = Array.from(upcomingGigElements)
            .map((gig) => {
                const venueText = gig.querySelector('.gig-venue')?.textContent?.trim();
                const displayDate = gig.querySelector('.gig-date')?.textContent?.trim();
                const ticketLink = gig.getAttribute('data-ticket-link')?.trim();
                const startDate = parseDisplayDateToIso(displayDate);

                if (!venueText || !startDate) {
                    return null;
                }

                const event = {
                    '@type': 'MusicEvent',
                    name: venueText,
                    startDate,
                    eventStatus: 'https://schema.org/EventScheduled',
                    performer: {
                        '@type': 'Person',
                        name: 'Alex Wardill',
                        url: 'https://alexwardill.com/',
                    },
                    location: {
                        '@type': 'Place',
                        name: getGigLocation(venueText),
                    },
                    url: 'https://alexwardill.com/gigs/',
                };

                if (ticketLink) {
                    event.offers = {
                        '@type': 'Offer',
                        url: ticketLink,
                    };
                }

                return event;
            })
            .filter(Boolean);

        if (!events.length) {
            return;
        }

        const schema = {
            '@context': 'https://schema.org',
            '@graph': [
                {
                    '@type': 'CollectionPage',
                    name: 'Alex Wardill - Gigs',
                    url: 'https://alexwardill.com/gigs/',
                    hasPart: events,
                },
            ],
        };

        const existingSchema = document.getElementById('gigs-schema-jsonld');
        if (existingSchema) {
            existingSchema.remove();
        }

        const schemaScript = document.createElement('script');
        schemaScript.type = 'application/ld+json';
        schemaScript.id = 'gigs-schema-jsonld';
        schemaScript.textContent = JSON.stringify(schema);
        document.head.appendChild(schemaScript);
    }

    const upcomingGigs = document.querySelectorAll('.upcoming-gig');

    buildGigsSchema(upcomingGigs);

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
