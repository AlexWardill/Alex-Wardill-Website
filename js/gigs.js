(() => {
    const HOME_GIG_LIMIT = 5;

    async function loadGigs() {
        try {
            const response = await fetch('data/cms-content.json');
            if (!response.ok) {
                throw new Error(`CMS data request failed with status ${response.status}.`);
            }

            const data = await response.json();
            return Array.isArray(data?.gigs) ? data.gigs : null;
        } catch (error) {
            console.warn('Unable to load CMS gig data; using the prebuilt gig list.', error);
            return null;
        }
    }

    function buildGigsSchema(upcomingGigs) {
        const events = upcomingGigs.map((gig) => {
            const hasClockTime = /^[0-9]{1,2}:[0-9]{2}$/.test(gig.time || '');
            const event = {
                '@type': 'MusicEvent',
                name: gig.event ? `${gig.band} - ${gig.event}` : gig.band,
                startDate: hasClockTime ? `${gig.date}T${gig.time.padStart(5, '0')}` : gig.date,
                eventStatus: 'https://schema.org/EventScheduled',
                performer: {
                    '@type': 'Person',
                    name: 'Alex Wardill',
                    url: 'https://alexwardill.com/',
                },
                url: 'https://alexwardill.com/gigs/',
            };

            if (gig.venue) {
                event.location = { '@type': 'Place', name: gig.venue };
            }

            if (gig.ticketLink) {
                event.offers = { '@type': 'Offer', url: gig.ticketLink };
            }

            return event;
        });

        document.getElementById('gigs-schema-jsonld')?.remove();
        if (!events.length) {
            return;
        }

        const schemaScript = document.createElement('script');
        schemaScript.type = 'application/ld+json';
        schemaScript.id = 'gigs-schema-jsonld';
        schemaScript.textContent = JSON.stringify({
            '@context': 'https://schema.org',
            '@graph': [
                {
                    '@type': 'CollectionPage',
                    name: 'Alex Wardill - Gigs',
                    url: 'https://alexwardill.com/gigs/',
                    hasPart: events,
                },
            ],
        });
        document.head.appendChild(schemaScript);
    }

    async function hydrateGigs() {
        const gigs = await loadGigs();
        if (!gigs) {
            return;
        }

        const { sortGigEntries, renderGigListHtml } = await import('./cms-content.js');
        const { upcoming, past } = sortGigEntries(gigs);
        const fill = (selector, markup) => {
            const container = document.querySelector(selector);
            if (container) {
                container.innerHTML = markup;
            }
            return Boolean(container);
        };

        if (fill('.gigs-list:not(.gigs-list-previous)', renderGigListHtml(upcoming, 'upcoming'))) {
            buildGigsSchema(upcoming);
        }
        fill('.gigs-list-previous', renderGigListHtml(past, 'previous'));
        fill('.home-gigs-list', renderGigListHtml(upcoming.slice(0, HOME_GIG_LIMIT), 'home'));
    }

    hydrateGigs();
})();
