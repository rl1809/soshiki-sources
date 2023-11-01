import { createVideoEntry, createVideoEntryResults, createVideoEpisodeDetails, VideoEntry, EntryContentRating, VideoEntryResults, EntryStatus, FetchOptions, Listing, VideoEpisode, VideoEpisodeDetails, VideoSource, Filter, Document, fetch, createMultiSelectFilter, createSortFilter, MultiSelectFilter, SortFilter, createListing, createVideoEpisode, VideoEpisodeType, VideoEpisodeUrl, createVideoEpisodeProvider, VideoEpisodeProvider, createSegmentFilter, createAscendableSortFilter, createExcludableMultiSelectFilter, createVideoEpisodeUrl, ListingType, FilterGroup, createFilterGroup, VideoEpisodeResults, createVideoEpisodeResults } from "soshiki-sources"
import { parse, splitCookiesString, Cookie } from "set-cookie-parser"

export default class MarinSource extends VideoSource {
    INERTIA_VERSION = "ca886640f755549c7a6529989f873c06"
    USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.116 Safari/537.36'
    BASE_URL = "https://marin.moe"

    cookies: string[] = []

    id = "multi_marin"
    async getListing(listing: Listing, page: number): Promise<VideoEntryResults> {
        const data = {
            sort: listing.id,
            page
        }
        const json = await this.fetchWithCookies(`${this.BASE_URL}/anime`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "User-Agent": this.USER_AGENT,
                "Referer": `${this.BASE_URL}/anime`,
                "X-Requested-With": "XMLHttpRequest",
                "X-Inertia-Partial-Data": "anime_list",
                "X-Inertia-Partial-Component": "AnimeIndex",
                "X-Inertia": "true",
                "X-Inertia-Version": this.INERTIA_VERSION
            },
            body: JSON.stringify(data)
        }).then(res => JSON.parse(res.data).props)
        return createVideoEntryResults({
            results: json.anime_list.data.map((item: any) => createVideoEntry({
                id: item.slug,
                title: item.title,
                cover: item.cover
            })),
            page: page,
            hasMore: page < json.anime_list.meta.last_page
        })
    }
    async getSearchResults(query: string, page: number, filters: Filter[]): Promise<VideoEntryResults> {
        const sort = (filters.find(filter => filter.id === "sort")?.value as any[])?.find(e => e.selected)
        let filterMap: {[key: string]: {id: number, opr: "include" | "exclude"}[]} = {}
        for (const filter of filters.filter(filter => filter.id !== "sort")) {
            filterMap[filter.id] = (filter.value as any[]).map(value => ({ id: parseInt(value.id), opr: value.excluded === true ? "exclude" : "include" }))
        }
        const data = {
            sort: (sort?.id ?? "az") + (sort?.ascending === true ? "-a" : "-d"),
            filter: filterMap,
            search: query,
            page
        }
        const json = await this.fetchWithCookies(`${this.BASE_URL}/anime`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "User-Agent": this.USER_AGENT,
                "Referer": `${this.BASE_URL}/anime`,
                "X-Requested-With": "XMLHttpRequest",
                "X-Inertia-Partial-Data": "anime_list",
                "X-Inertia-Partial-Component": "AnimeIndex",
                "X-Inertia": "true",
                "X-Inertia-Version": this.INERTIA_VERSION
            },
            body: JSON.stringify(data)
        }).then(res => JSON.parse(res.data).props)
        return createVideoEntryResults({
            results: json.anime_list.data.map((item: any) => createVideoEntry({
                id: item.slug,
                title: item.title,
                cover: item.cover
            })),
            page: page,
            hasMore: page < json.anime_list.meta.last_page
        })
    }
    async getEntry(id: string): Promise<VideoEntry> {
        const json = await this.fetchWithCookies(`${this.BASE_URL}/anime/${id}`, {
            headers: {
                "Content-Type": "application/json",
                "User-Agent": this.USER_AGENT,
                "Referer": `${this.BASE_URL}/anime`,
                "X-Requested-With": "XMLHttpRequest",
                "X-Inertia-Partial-Data": "anime",
                "X-Inertia-Partial-Component": "AnimeDetail",
                "X-Inertia": "true",
                "X-Inertia-Version": this.INERTIA_VERSION
            }
        }).then(res => JSON.parse(res.data).props.anime)
        return createVideoEntry({
            id,
            title: json.title,
            tags: json.genre_list.map((item: {name: string}) => item.name),
            cover: json.cover,
            contentRating: json.content_rating.id === 6 ? EntryContentRating.nsfw : json.content_rating.id === 4 ? EntryContentRating.suggestive : EntryContentRating.safe,
            status: json.status.id === 2 ? EntryStatus.ongoing : json.status.id === 3 ? EntryStatus.completed : json.status.id === 4 ? EntryStatus.hiatus : EntryStatus.unknown,
            links: [ `${this.BASE_URL}/anime/${id}` ],
            synopsis: json.description
        })
    }
    async getEpisodes(id: string, page: number): Promise<VideoEpisodeResults> {
        const json = await this.fetchWithCookies(`${this.BASE_URL}/anime/${id}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "User-Agent": this.USER_AGENT,
                "Referer": `${this.BASE_URL}/anime`,
                "X-Requested-With": "XMLHttpRequest",
                "X-Inertia-Partial-Data": "episode_list",
                "X-Inertia-Partial-Component": "AnimeDetail",
                "X-Inertia": "true",
                "X-Inertia-Version": this.INERTIA_VERSION
            },
            body: JSON.stringify({
                filter: { episodes: true, specials: true },
                sort: "srt-d",
                eps_page: page
            })
        }).then(res => JSON.parse(res.data).props.episode_list)
        return createVideoEpisodeResults({
            page: page,
            hasMore: page < json.meta.last_page,
            results: json.data.map((episode: any) => createVideoEpisode({
                id: episode.slug,
                entryId: id,
                episode: isNaN(parseInt(episode.slug)) ? episode.sort : parseInt(episode.slug),
                type: VideoEpisodeType.unknown,
                name: episode.title
            }))
        })
    }
    async getEpisodeDetails(id: string, entryId: string): Promise<VideoEpisodeDetails> {
        const json = await this.fetchWithCookies(`${this.BASE_URL}/anime/${entryId}/${id}`, {
            headers: {
                "Content-Type": "application/json",
                "User-Agent": this.USER_AGENT,
                "Referer": `${this.BASE_URL}/anime`,
                "X-Requested-With": "XMLHttpRequest",
                "X-Inertia-Partial-Component": "Episode",
                "X-Inertia": "true",
                "X-Inertia-Version": this.INERTIA_VERSION
            }
        }).then(res => JSON.parse(res.data).props)
        let providers: VideoEpisodeProvider[] = [createVideoEpisodeProvider({
            name: `${json.video.data.title} - ${json.video.data.audio.name} (${json.video.data.subtitle.id === 1 ? "No" : json.video.data.subtitle.name} Subtitles)`,
            urls: json.video.data.mirror.map((url: any) => createVideoEpisodeUrl({
                quality: parseInt(url.resolution.slice(0, -1)),
                url: url.code.file
            }))
        })]
        await Promise.all(json.video_list.data.filter((provider: any) => provider.slug !== json.video.data.slug).map((provider: any) => new Promise<void>(async res => {
            const json = await this.fetchWithCookies(`${this.BASE_URL}/anime/${entryId}/${id}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "User-Agent": this.USER_AGENT,
                    "Referer": `${this.BASE_URL}/anime`,
                    "X-Requested-With": "XMLHttpRequest",
                    "X-Inertia-Partial-Component": "Episode",
                    "X-Inertia": "true",
                    "X-Inertia-Version": this.INERTIA_VERSION
                },
                body: JSON.stringify({ video: provider.slug })
            }).then(res => JSON.parse(res.data).props)
            providers.push(createVideoEpisodeProvider({
                name: `${json.video.data.title} - ${json.video.data.audio.name} (${json.video.data.subtitle.id === 1 ? "No" : json.video.data.subtitle.name} Subtitles)`,
                urls: json.video.data.mirror.map((url: any) => createVideoEpisodeUrl({
                    quality: parseInt(url.resolution.slice(0, -1)),
                    url: url.code.file
                }))
            }))
            res()
        })))
        return createVideoEpisodeDetails({
            id,
            entryId,
            providers
        })
    }
    async getFilters(): Promise<FilterGroup[]> {
        const json = await this.fetchWithCookies(`${this.BASE_URL}/anime`, {
            headers: {
                "Content-Type": "application/json",
                "User-Agent": this.USER_AGENT,
                "Referer": `${this.BASE_URL}/anime`,
                "X-Requested-With": "XMLHttpRequest",
                "X-Inertia-Partial-Component": "AnimeIndex",
                "X-Inertia": "true",
                "X-Inertia-Version": this.INERTIA_VERSION
            }
        }).then(res => JSON.parse(res.data).props)
        if (typeof json !== 'object') return []
        let filters: Filter[] = []
        const sortKeys = Object.keys(json.sort_list).filter(key => key.endsWith("-d"))
        let sortOptions: any[] = []

        for (const sortKey of sortKeys) {
            sortOptions.push({ id: sortKey.replace("-d", ""), name: json.sort_list[sortKey], selected: false, ascending: false })
        }
        filters.push(createAscendableSortFilter({
            id: "sort",
            name: "Sort",
            value: sortOptions
        }))
        for (const taxonomyKey of Object.keys(json.taxonomy_list)) {
            const taxonomyName = taxonomyKey.split("_").map(word => word[0].toUpperCase() + word.substring(1)).join(" ")

            filters.push(createExcludableMultiSelectFilter({
                id: taxonomyKey,
                name: taxonomyName,
                value: json.taxonomy_list[taxonomyKey].map((item: { id: string, name: string }) => ({ id: `${item.id}`, name: item.name, selected: false, excluded: false }))
            }))
        }
        return [
            createFilterGroup({
                filters: filters
            })
        ]
    }
    async getListings(): Promise<Listing[]> {
        return [
            createListing({
                id: "rel-d",
                name: "Latest Release",
                type: ListingType.featured
            }),
            createListing({
                id: "vwk-d",
                name: "Most Popular (Weekly)",
                type: ListingType.basic
            }),
            createListing({
                id: "vmt-d",
                name: "Most Popular (Monthly)",
                type: ListingType.basic
            }),
            createListing({
                id: "vtt-d",
                name: "Most Popular (All Time)",
                type: ListingType.basic
            })
        ]
    }
    async getSettings(): Promise<FilterGroup[]> {
        return []
    }
    async modifyVideoRequest(url: string, options: FetchOptions): Promise<{ url: string; options: FetchOptions; }> {
        return {
            url,
            options: {
                ...options ?? {},
                headers: {
                    ...options.headers ?? {},
                    "Cookie": this.cookies.join("; ")
                }
            }
        }
    }

    async fetchWithCookies(url: string, options?: FetchOptions): ReturnType<typeof fetch> {
        let res = await fetch(url, {
            ...(options ?? {}),
                headers: {
                    ...(options?.headers ?? {}),
                    "Cookie": this.cookies.join("; "),
                    "X-XSRF-TOKEN": decodeURIComponent(this.cookies.find(cookie => cookie.split("=")[0] === "XSRF-TOKEN")?.substring("XSRF-TOKEN=".length) ?? "")
                }
        })
        if (res.status < 200 || res.status >= 300) {
            this.updateCookies(await this.getDDoSGuardCookies(this.BASE_URL))
            res = await fetch(url, {
                ...(options ?? {}),
                headers: {
                    ...(options?.headers ?? {}),
                    "Cookie": this.cookies.join("; "),
                    "X-XSRF-TOKEN": decodeURIComponent(this.cookies.find(cookie => cookie.split("=")[0] === "XSRF-TOKEN")?.substring("XSRF-TOKEN=".length) ?? "")
                }
            })
        }
        const newCookies = parse(splitCookiesString(res.headers["Set-Cookie"]), { decodeValues: false })
        this.updateCookies(newCookies)
        return res
    }
    
    updateCookies(newCookies: Cookie[]) {
        for (const newCookie of newCookies) {
            const oldCookieIndex = this.cookies.findIndex(cookie => cookie.split("=")[0] === newCookie.name)
            if (oldCookieIndex !== -1) {
                this.cookies[oldCookieIndex] = `${newCookie.name}=${newCookie.value}`
            } else {
                this.cookies.push(`${newCookie.name}=${newCookie.value}`)
            }
        }
    }
    
    async getDDoSGuardCookies(url: string, method: string = "GET"): Promise<Cookie[]> {
        const referer = url.match(/(https:\/\/[^\/]*)/)?.[1] + "/"
        if (typeof referer !== 'string') return []
        let res = await fetch(url, {
            method: method,
            headers: {
                "User-Agent": this.USER_AGENT,
                "Accept": "*/*",
                "Accept-Language": "en-US,en;q=0.5",
                "Accept-Encoding": "gzip, deflate",
                "Sec-Fetch-Dest": "document",
                "Sec-Fetch-Mode": "navigate",
                "Sec-Fetch-Site": "none"
            }
        })
        const initialBody = res.data
        let cookies = parse(splitCookiesString(res.headers["Set-Cookie"]), { decodeValues: false })
        res = await fetch(url, {
            method: method,
            headers: {
                "User-Agent": this.USER_AGENT,
                "Accept": "*/*",
                "Referer": referer,
                "Cookie": cookies.map(cookie => `${cookie.name}=${cookie.value}`).join("; ")
            }
        })
        cookies.push(...parse(splitCookiesString(res.headers["Set-Cookie"]), { decodeValues: false }))
        let images: string[] = []
        for (const scriptMatch of Array.from(initialBody.matchAll(/loadScript\(\"(.*?)\"/g), v => v[1])) {
            if (typeof scriptMatch !== 'string' || scriptMatch.includes("/.well-known/ddos-guard/check")) continue
            const sres = await fetch(scriptMatch.startsWith("/") ? referer + scriptMatch.substring(1) : scriptMatch, {
                headers: {
                    "User-Agent": this.USER_AGENT,
                    "Accept": "*/*",
                    "Accept-Language": "en-US,en;q=0.5",
                    "Accept-Encoding": "gzip, deflate",
                    "Referer": referer,
                    "Sec-Fetch-Dest": "script",
                    "Sec-Fetch-Mode": "no-cors",
                    "Sec-Fetch-Site": scriptMatch.includes("ddos-guard.net") ? "same-site" : "cross-site"
                }
            }).then(res => res.data)
            images.push(...Array.from(sres.matchAll(/src.*?\'(.*?)\'/g), v => v[1].startsWith("/") ? referer + v[1].substring(1) : v[1]))
        }
        await Promise.all(images.map(image => new Promise<void>(async (resolve, reject) => {
            const res = await fetch(image, {
                headers: {
                    "User-Agent": this.USER_AGENT,
                    "Accept": "*/*",
                    "Accept-Language": "en-US,en;q=0.5",
                    "Accept-Encoding": "gzip, deflate",
                    "Referer": referer,
                    "Sec-Fetch-Dest": "image",
                    "Sec-Fetch-Mode": "no-cors",
                    "Sec-Fetch-Site": "same-origin"
                }
            }).catch(console.error)
            if (!(res instanceof Object)) {
                reject()
                return
            }
            cookies.push(...parse(splitCookiesString(res.headers["Set-Cookie"]), { decodeValues: false }))
            resolve()
        })))
        res = await fetch(`${referer}.well-known/ddos-guard/mark/`, {
            method: "POST",
            headers: {
                "User-Agent": this.USER_AGENT,
                "Content-Type": "text/plain;charset=UTF-8",
                "Accept": "*/*",
                "Accept-Language": "en-US,en;q=0.5",
                "Accept-Encoding": "gzip, deflate",
                "Referer": referer,
                "Cookie": cookies.map(cookie => `${cookie.name}=${cookie.value}`).join("; "),
                "DNT": "1",
                "Sec-Fetch-Dest": "empty",
                "Sec-Fetch-Mode": "cors",
                "Sec-Fetch-Site": "same-origin"
            },
            body: `{"_geo":true,"_sensor":{"gyroscope":false,"accelerometer":false,"magnetometer":false,"absorient":false,"relorient":false},"userAgent":"Linux_x86_64_Gecko_Mozilla_undefined","webdriver":false,"language":"en-US","colorDepth":32,"deviceMemory":"not available","pixelRatio":1,"hardwareConcurrency":12,"screenResolution":[1920,1080],"availableScreenResolution":[1920,1080],"timezoneOffset":240,"timezone":"America/New_York","sessionStorage":true,"localStorage":true,"indexedDb":true,"addBehavior":false,"openDatabase":false,"cpuClass":"not available","platform":"Linux x86_64","doNotTrack":"1","plugins":[["PDF Viewer","Portable Document Format",[["application/pdf","pdf"],["text/pdf","pdf"]]],["Chrome PDF Viewer","Portable Document Format",[["application/pdf","pdf"],["text/pdf","pdf"]]],["Chromium PDF Viewer","Portable Document Format",[["application/pdf","pdf"],["text/pdf","pdf"]]],["Microsoft Edge PDF Viewer","Portable Document Format",[["application/pdf","pdf"],["text/pdf","pdf"]]],["WebKit built-in PDF","Portable Document Format",[["application/pdf","pdf"],["text/pdf","pdf"]]]],"canvas":[],"webgl":false,"adBlock":false,"hasLiedLanguages":false,"hasLiedResolution":false,"hasLiedOs":false,"hasLiedBrowser":false,"touchSupport":[0,false,false],"fonts":["Andale Mono","Arial","Arial Black","Bitstream Vera Sans Mono","Calibri","Cambria","Cambria Math","Comic Sans MS","Consolas","Courier","Courier New","Georgia","Helvetica","Impact","Lucida Console","LUCIDA GRANDE","Lucida Sans Unicode","Palatino","Times","Times New Roman","Trebuchet MS","Verdana"],"audio":"100.00000","enumerateDevices":["audioinput;"],"context":"free_splash"}`
        })
        cookies.push(...parse(splitCookiesString(res.headers["Set-Cookie"]), { decodeValues: false }))
        res = await fetch(url, {
            method: method,
            headers: {
                "User-Agent": this.USER_AGENT,
                "Accept": "*/*",
                "Referer": referer,
                "Cookie": cookies.map(cookie => `${cookie.name}=${cookie.value}`).join("; ")
            }
        })
        cookies.push(...parse(splitCookiesString(res.headers["Set-Cookie"]), { decodeValues: false }))
        return cookies
    }
}