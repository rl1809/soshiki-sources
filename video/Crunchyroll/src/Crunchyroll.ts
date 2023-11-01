import { createVideoEntry, createVideoEntryResults, createVideoEpisodeDetails, VideoEntry, EntryContentRating, VideoEntryResults, EntryStatus, FetchOptions, Listing, VideoEpisode, VideoEpisodeDetails, VideoSource, Filter, Document, fetch, createMultiSelectFilter, createSortFilter, MultiSelectFilter, SortFilter, createListing, createVideoEpisode, VideoEpisodeType, VideoEpisodeUrl, createVideoEpisodeProvider, VideoEpisodeProvider, createSegmentFilter, createSelectFilter, createTextFilter, createVideoEpisodeUrl, VideoEpisodeResults, createVideoEpisodeResults, FilterGroup, createFilterGroup, ListingType } from "soshiki-sources"

export default class GogoanimeSource extends VideoSource {
    BASE_URL = "https://beta-api.crunchyroll.com"

    AUTH_TOKEN = "Basic aHJobzlxM2F3dnNrMjJ1LXRzNWE6cHROOURteXRBU2Z6QjZvbXVsSzh6cUxzYTczVE1TY1k="

/**
 *  BUCKET: '/index/v2',
    PROFILE: '/accounts/v1/me/profile',
    TOKEN: '/auth/v1/token',
    SEARCH: '/content/v1/search',
    STREAMS: '/content/v2/cms/videos/:videoid/streams',
    SERIE: '/content/v2/cms/objects/:mediaid',
    SEASONS: '/content/v2/cms/series/:mediaid/seasons',
    SEASON: '/content/v2/cms/objects/:seasonid',
    EPISODES: 'content/v2/cms/seasons/:seasonid/episodes',
    EPISODE: 'content/v2/cms/objects/:episodeid',
    SIMILAR: '/content/v1/{}/similar_to',
    NEWSFEED: '/content/v1/news_feed',
    BROWSE: '/content/v1/browse',
    CATEGORIES: '/content/v2/discover/categories',
    POPULAR: '/content/v1/browse?sort_by=popularity&n=36&locale=:locale',
    SIMULCAST: 'content/v1/browse?season_tag=winter-2023&n=100&locale=:locale',
 */

    LOCALES = {
        "English": "en-US",
        "Japanese": "ja-JP",
        "Spanish (Latin America)": "es-419",
        "Spanish (Latin America) [2]": "es-LA",
        "Spanish (Spain)": "es-ES",
        "French": "fr-FR",
        "Portuguese (Portugal)": "pt-PT",
        "Portuguese (Brazil)": "pt-BR",
        "Italian": "it-IT",
        "German": "de-DE",
        "Russian": "ru-RU",
        "Arabic": "ar-SA",
        "Arabic [2]": "ar-ME",
        "Chinese": "zh-CN",
        "Hindi": "hi-IN"
    } as {[key: string]: string}

    USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.116 Safari/537.36'

    mappings: {[key: string]: {[key2: string]: string}} = {}

    token: string | undefined
    refresh: string | undefined

    id = "multi_crunchyroll"

    get locale(): string {
        return (this.getSettingsValue("locale") as any)?.id ?? "en-US"
    }

    async getListing(listing: Listing, page: number): Promise<VideoEntryResults> {
        let url = `${this.BASE_URL}/content/v1/browse?sort_by=${listing.id === "" ? "popularity" : listing.id}&n=50&start=${(page - 1) * 50}&locale=${this.locale}`
        const json = await this.fetchAuth(url).then(res => JSON.parse(res.data))
        return createVideoEntryResults({
            page,
            results: json.items?.map((item: any) => createVideoEntry({
                id: item.id,
                title: item.title,
                cover: item.images?.poster_tall?.[0]?.sort((a: any, b: any) => b.height - a.height)[0]?.source ?? ""
            })) ?? [],
            hasMore: (json.total ?? 0) > page * 50
        })
    }
    async getSearchResults(query: string, page: number, filters: Filter[]): Promise<VideoEntryResults> {
        let url = `${this.BASE_URL}/content/v1/search?q=${encodeURIComponent(query)}&n=50&start=${(page - 1) * 50}&locale=${this.locale}`
        const json = await this.fetchAuth(url).then(res => JSON.parse(res.data))
        return createVideoEntryResults({
            page,
            results: json.items?.find((e: any) => e.type === "series")?.items.map((item: any) => createVideoEntry({
                id: item.id,
                title: item.title,
                cover: item.images?.poster_tall?.[0]?.sort((a: any, b: any) => b.height - a.height)[0]?.source ?? ""
            })) ?? [],
            hasMore: json.items?.find((e: any) => e.type === "series")?.total > page * 50 ?? false
        })
    }
    async getEntry(id: string): Promise<VideoEntry> {
        const json = await this.fetchAuth(`${this.BASE_URL}/content/v2/cms/objects/${id}`).then(res => JSON.parse(res.data))
        const item = json.data[0]
        return createVideoEntry({
            id,
            title: item.title,
            tags: item.series_metadata.tenant_categories,
            cover: item.images?.poster_tall?.[0]?.sort((a: any, b: any) => b.height - a.height)[0]?.source ?? "",
            banner: item.images?.poster_wide?.[0]?.sort((a: any, b: any) => b.height - a.height)[0]?.source ?? "",
            contentRating: item.series_metadata.is_mature ? EntryContentRating.nsfw : EntryContentRating.safe,
            status: EntryStatus.unknown,
            links: [ `https://www.crunchyroll.com/series/${id}` ],
            synopsis: item.description,
        })
    }
    async getEpisodes(id: string, page: number): Promise<VideoEpisodeResults> {
        const json = await this.fetchAuth(`${this.BASE_URL}/content/v2/cms/series/${id}/seasons`).then(res => JSON.parse(res.data))
        return createVideoEpisodeResults({
            page: page,
            hasMore: false,
            results: await Promise.all(
                json.data.map((season: any) => new Promise(async res => {
                    const episodeJson = await this.fetchAuth(`${this.BASE_URL}/content/v2/cms/seasons/${season.id}/episodes`).then(res => JSON.parse(res.data))
                    res(episodeJson.data.map((episode: any) => episode.versions.filter((version: any) => version.audio_locale === this.locale || version.audio_locale === "ja-JP").map((version: any) => createVideoEpisode({
                        id: version.media_guid,
                        entryId: id,
                        name: episode.title,
                        episode: episode.episode_number,
                        season: episode.season_number,
                        thumbnail: episode.images.thumbnail[0]?.sort((a: any, b: any) => b.height - a.height)[0]?.source ?? "",
                        timestamp: Date.parse(episode.upload_date) / 1000,
                        type: version.audio_locale === this.locale ? VideoEpisodeType.dub : episode.subtitle_locales.length > 0 ? VideoEpisodeType.sub : VideoEpisodeType.native
                    }))))
                }))
            ).then(data => data.flat(3).sort((a: any, b: any) => b.season - a.season === 0 ? b.episode - a.episode : b.season - a.season))
        })
    }
    async getEpisodeDetails(id: string, entryId: string): Promise<VideoEpisodeDetails> {
        const json = await this.fetchAuth(`${this.BASE_URL}/content/v2/cms/videos/${id}/streams`).then(res => JSON.parse(res.data))
        const streams = json.data[0].adaptive_hls
        const promises = Object.values(streams).filter((stream: any) => stream.hardsub_locale === this.locale).map((stream: any) => new Promise(async res => {
            const m3u8Urls = await fetch(stream.url).then(resp => resp.data).catch(() => null)
            if (m3u8Urls === null) return createVideoEpisodeProvider({
                name: `Crunchyroll (${stream.hardsub_locale === "" ? "none" : stream.hardsub_locale})`,
                urls: []
            })

            const videoList = m3u8Urls.split('#EXT-X-STREAM-INF:')
          
            let urls: VideoEpisodeUrl[] = []
            for (const video of videoList ?? []) {
                if (!video.includes('m3u8')) continue
    
                const url = video.split('\n')[1]
                const quality = video.split('RESOLUTION=')[1].split(',')[0].split('x')[1]
                urls.push({
                    url,
                    quality: parseFloat(quality)
                })
            }
            res(createVideoEpisodeProvider({
                name: `Crunchyroll (${Object.entries(this.LOCALES).find(loc => loc[1] === stream.hardsub_locale)?.[0] ?? "None"})`,
                urls
            }))
        })) as Promise<VideoEpisodeProvider>[];
        
        return createVideoEpisodeDetails({
            id,
            entryId,
            providers: await Promise.all(promises)
        });
    }
    async getFilters(): Promise<FilterGroup[]> {
        return []
    }
    async getListings(): Promise<Listing[]> {
        return [
            createListing({
                id: "newly_added",
                name: "Newly Added",
                type: ListingType.trending
            }),
            createListing({
                id: "popularity",
                name: "Popularity",
                type: ListingType.topRated
            })
        ]
    }
    async getSettings(): Promise<FilterGroup[]> {
        return [
            createFilterGroup({
                header: "General",
                filters: [
                    createSelectFilter({
                        id: "locale",
                        name: "Locale",
                        value: Object.entries(this.LOCALES).map(locale => ({
                            id: locale[1],
                            name: locale[0],
                            selected: locale[1] === "en-US"
                        }))
                    })
                ]
            }),
            createFilterGroup({
                header: "Account",
                filters: [
                    createTextFilter({
                        id: "email",
                        name: "Email",
                        value: ""
                    }),
                    createTextFilter({
                        id: "password",
                        name: "Password",
                        value: ""
                    })
                ]
            })
        ]
    }
    async modifyVideoRequest(url: string, options: FetchOptions): Promise<{ url: string; options: FetchOptions; }> {
        return { url, options }
    }

    async fetchAuth(url: string, options?: FetchOptions): ReturnType<typeof fetch> {
        if (typeof this.token === 'undefined') {
            await this.login()
        }
        let res = await fetch(url, {
            ...(options ?? {}),
                headers: {
                    ...(options?.headers ?? {}),
                    "Authorization": `Bearer ${this.token}`,
                    "User-Agent": this.USER_AGENT
                }
        })
        if (res.status === 401 || typeof this.token !== 'undefined') {
            await this.login()
            res = await fetch(url, {
                ...(options ?? {}),
                headers: {
                    ...(options?.headers ?? {}),
                    "Authorization": `Bearer ${this.token}`,
                    "User-Agent": this.USER_AGENT
                }
            })
        }
        return res
    }

    async login() {
        if (typeof this.refresh !== "undefined") {
            const res = await fetch(`${this.BASE_URL}/auth/v1/token`, {
                method: "POST",
                headers: {
                    "User-Agent": this.USER_AGENT,
                    "Authorization": this.AUTH_TOKEN,
                    "Content-Type": "application/x-www-form-urlencoded"
                },
                body: [
                    "scope=offline_access",
                    `refresh_token=${this.refresh}`,
                    "grant_type=refresh_token"
                ].join("&")
            }).then(res => JSON.parse(res.data))
            this.token = res.access_token
            this.refresh = res.refresh_token
        } else {
            const res = await fetch(`${this.BASE_URL}/auth/v1/token`, {
                method: "POST",
                headers: {
                    "User-Agent": this.USER_AGENT,
                    "Authorization": this.AUTH_TOKEN,
                    "Content-Type": "application/x-www-form-urlencoded"
                },
                body: [
                    "scope=offline_access",
                    `username=${(this.getSettingsValue("email") as string).trim()}`,
                    `password=${(this.getSettingsValue("password") as string).trim()}`,
                    "grant_type=password"
                ].join("&")
            }).then(res => JSON.parse(res.data))
            this.token = res.access_token
            this.refresh = res.refresh_token
        }
    }
}