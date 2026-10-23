(() => {
    async function loadCmsData() {
        try {
            const response = await fetch('data/cms-content.json');
            if (!response.ok) {
                throw new Error(`CMS data request failed with status ${response.status}.`);
            }

            return response.json();
        } catch (error) {
            console.warn('Unable to load CMS gig data; using the static gig list.', error);
            return null;
        }
    }

    function parseDisplayDateToIso(displayDate) {
        const match = displayDate
            ?.trim()
            .match(/^(\d{1,2})(?:st|nd|rd|th)\s+([A-Za-z]+)(?:\s+(\d{4}))?$/i);

        if (!match) {
            return null;
        }

        const day = Number.parseInt(match[1], 10);
        const monthName = match[2].toLowerCase();
        const year = Number.parseInt(match[3] || String(new Date().getFullYear()), 10);
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

    function formatGigLabel(gig) {
        if (!gig) {
            return '';
        }

        const title = gig.title || '';
        const venue = gig.venue || '';

        if (title && venue) {
            return `${title} @ ${venue}`;
        }

        return title || venue;
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

    function extractStaticGigs() {
        return Array.from(document.querySelectorAll('.gig-item')).map((gig) => {
            const rawTitle = gig.querySelector('.gig-venue')?.textContent?.trim() || '';
            const rawDate = gig.querySelector('.gig-date')?.textContent?.trim() || '';
            const ticketUrl = gig.getAttribute('data-ticket-link')?.trim() || '';
            const isoDate = parseDisplayDateToIso(rawDate);

            if (!rawTitle || !isoDate) {
                return null;
            }

            const hasVenue = rawTitle.includes('@');
            const title = hasVenue ? rawTitle.split('@')[0].trim() : rawTitle;
            const venue = hasVenue ? rawTitle.split('@').slice(1).join('@').trim() : rawTitle;

            return {
                title,
                venue,
                date: isoDate,
                ticketUrl,
            };
        }).filter(Boolean);
    }

    function renderGigList(gigs, containerSelector, { allowTicketLinks = true, upcoming = false } = {}) {
        const container = document.querySelector(containerSelector);
        if (!container) {
            return;
        }

        container.innerHTML = '';

        if (!gigs.length) {
            const placeholder = document.createElement('div');
            placeholder.className = 'gig-item gig-item-simple';
            placeholder.innerHTML = '<div class="gig-venue">No gigs scheduled yet.</div><div class="gig-date">Check back soon</div>';
            container.appendChild(placeholder);
            return;
        }

        gigs.forEach((gig) => {
            const item = document.createElement('div');
            const ticketLink = allowTicketLinks ? (gig.ticketUrl || '').trim() : '';
            const formattedText = formatGigLabel(gig);
            const dateText = gig.date ? new Date(`${gig.date}T00:00:00`).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'short',
                year: upcoming ? undefined : 'numeric',
            }) : '';

            item.className = `gig-item ${upcoming ? 'upcoming-gig' : 'gig-item-simple'}`;
            if (ticketLink) {
                item.classList.add('gig-item-clickable');
                item.setAttribute('tabindex', '0');
                item.setAttribute('role', 'link');
                item.setAttribute('aria-label', `Open ticket link for ${formattedText}`);
                item.setAttribute('data-ticket-link', ticketLink);
                item.addEventListener('click', () => window.open(ticketLink, '_blank', 'noopener,noreferrer'));
                item.addEventListener('keydown', (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        window.open(ticketLink, '_blank', 'noopener,noreferrer');
                    }
                });
            }

            const venue = document.createElement('div');
            venue.className = 'gig-venue';
            venue.textContent = formattedText;
            const date = document.createElement('div');
            date.className = 'gig-date';
            date.textContent = dateText;
            item.append(venue, date);
            container.appendChild(item);
        });
    }

    function renderHomeGigList(gigs, containerSelector) {
        const container = document.querySelector(containerSelector);
        if (!container) {
            return;
        }

        container.innerHTML = '';

        if (!gigs.length) {
            const placeholder = document.createElement('div');
            placeholder.className = 'home-gig-item';
            placeholder.innerHTML = '<span class="home-gig-venue">No gigs scheduled yet.</span><span class="home-gig-date">Check back soon</span>';
            container.appendChild(placeholder);
            return;
        }

        gigs.forEach((gig) => {
            const ticketLink = (gig.ticketUrl || '').trim();
            const venueText = formatGigLabel(gig);
            const dateText = gig.date ? new Date(`${gig.date}T00:00:00`).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'short',
            }) : '';

            const item = ticketLink ? document.createElement('a') : document.createElement('div');
            item.className = 'home-gig-item';
            item.setAttribute('aria-label', ticketLink ? `Open ticket link for ${venueText}` : venueText);

            if (ticketLink) {
                item.href = ticketLink;
                item.target = '_blank';
                item.rel = 'noopener noreferrer';
            }

            const venue = document.createElement('span');
            venue.className = 'home-gig-venue';
            venue.textContent = venueText;
            const date = document.createElement('span');
            date.className = 'home-gig-date';
            date.textContent = dateText;
            item.append(venue, date);

            container.appendChild(item);
        });
    }

    function mergeGigSources(cmsGigs, fallbackGigs) {
        const map = new Map();

        [...fallbackGigs, ...cmsGigs].forEach((gig) => {
            if (!gig || !gig.date || !gig.title) {
                return;
            }

            const key = `${gig.date}|${gig.title}`;
            if (!map.has(key)) {
                map.set(key, gig);
            }
        });

        return Array.from(map.values());
    }

    async function hydrateCmsGigs() {
        const fallbackGigs = extractStaticGigs();
        const cmsData = await loadCmsData();
        const cmsGigs = cmsData && Array.isArray(cmsData.gigs) ? cmsData.gigs : [];
        const allGigs = mergeGigSources(cmsGigs, fallbackGigs);

        const { getUpcomingGigEntries, sortGigEntries } = await import('./cms-content.js');
        const { upcoming, past } = sortGigEntries(allGigs);

        renderGigList(upcoming, '.gigs-list', { allowTicketLinks: true, upcoming: true });
        renderGigList(past, '.gigs-list-previous', { allowTicketLinks: true, upcoming: false });

        const homeContainer = document.querySelector('.home-gigs-list');
        if (homeContainer) {
            renderHomeGigList(getUpcomingGigEntries(allGigs, 5), '.home-gigs-list');
        }

        const upcomingGigNodes = document.querySelectorAll('.upcoming-gig');
        buildGigsSchema(upcomingGigNodes);
    }

    const existingUpcoming = document.querySelectorAll('.upcoming-gig');
    if (existingUpcoming.length) {
        buildGigsSchema(existingUpcoming);
        existingUpcoming.forEach((gig) => {
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
    }

    hydrateCmsGigs();
})();
