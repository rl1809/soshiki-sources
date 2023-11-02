import {
    createVideoEntry,
    createVideoEntryResults,
    createVideoEpisodeDetails,
    VideoEntry,
    EntryContentRating,
    VideoEntryResults,
    EntryStatus,
    FetchOptions,
    Listing,
    VideoEpisode,
    VideoEpisodeDetails,
    VideoSource,
    Filter,
    Document,
    fetch,
    createMultiSelectFilter,
    createSortFilter,
    MultiSelectFilter,
    SortFilter,
    createListing,
    createVideoEpisode,
    VideoEpisodeType,
    VideoEpisodeUrl,
    createVideoEpisodeProvider,
    VideoEpisodeProvider,
    createSegmentFilter,
    createToggleFilter,
    FilterType,
    createFilterGroup,
    FilterGroup,
    ListingType,
    VideoEpisodeResults,
    createVideoEpisodeResults,
} from "soshiki-sources";
import CryptoJS from "crypto-es";

const BASE_URL = "https://animetvn2.com";

const AJAX_URL = "https://animetvn2.com/ajax";

const URL_REGEX = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/;

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.116 Safari/537.36";

const STREAMSB_HOST = "https://streamsss.net";
const STREAMSB_PAYLOAD_START = "5773626d62663976713374717c7c";
const STREAMSB_PAYLOAD_END = "7c7c346f323179543569386f31597c7c73747265616d7362";

export default class GogoanimeSource extends VideoSource {
    id = "vi_animetvn";
    async getListing(listing: Listing, page: number): Promise<VideoEntryResults> {
        let entries: VideoEntry[] = [];

        const document = Document.parse(
            await fetch(`${BASE_URL}/nhom/${listing.id}.html?page=${page}`).then((res) => `${res.data}`)
        );
        const items = document.querySelectorAll("div.film-list > div.item.film_item");
        for (const item of items) {
            entries.push(
                createVideoEntry({
                    id: item.querySelector("a").getAttribute("href"),
                    title: item.querySelector("h3.title > a").innerText,
                    cover: item.querySelector("img.thumb").getAttribute("src"),
                    episodes: parseInt(item.querySelector("span.time").innerText.split("/")[1]),
                })
            );
        }

        document.free();

        return createVideoEntryResults({
            page,
            results: entries,
            hasMore: entries.length > 0,
        });
    }
    async getSearchResults(query: string, page: number, filters: Filter[]): Promise<VideoEntryResults> {
        let url = `${BASE_URL!}/filter.html?keyword=${encodeURIComponent(query)}&page=${page}`;
        for (const filter of filters) {
            if (filter.type === FilterType.sort) {
                url += `&${(filter as SortFilter).value.find((option) => option.selected)?.id ?? (filter as SortFilter).value[0].id}`;
            } else if (filter.type === FilterType.multiSelect) {
                for (const value of (filter as MultiSelectFilter).value) url += `&${value.id}`;
            }
        }
        const document = Document.parse(await fetch(url).then((res) => res.data));
        const items = document.querySelectorAll("ul.items > li");
        let entries: VideoEntry[] = [];
        for (const item of items) {
            const e = createVideoEntry({
                id: item.querySelector("a").getAttribute("href"),
                title: item.querySelector("p.name").innerText.trim(),
                cover: item.querySelector("img").getAttribute("src"),
            });
            entries.push(e);
        }
        document.free();
        return createVideoEntryResults({
            page,
            results: entries,
            hasMore: entries.length > 0,
        });
    }
    parseEntryStatus(status: string): EntryStatus {
        switch (status) {
            case "Ongoing":
                return EntryStatus.ongoing;
            case "Completed":
                return EntryStatus.completed;
            default:
                return EntryStatus.unknown;
        }
    }
    async getEntry(id: string): Promise<VideoEntry> {
        const document = Document.parse(await fetch(`${BASE_URL!}${id}`).then((res) => res.data));
        const info = document.querySelector("div.anime_info_body_bg");
        const types = info.querySelectorAll("p.type");
        const entry = createVideoEntry({
            id,
            title: info.querySelector("h1").innerText.trim(),
            tags: types[2].querySelectorAll("a").map((e) => e.innerText.replace(", ", "")),
            cover: info.querySelector("img").getAttribute("src"),
            contentRating: EntryContentRating.safe,
            status: this.parseEntryStatus(types[4].querySelector("a").innerText),
            links: [`${BASE_URL!}${id}`],
            synopsis: types[1].innerText.substring("Plot Summary: ".length).trim(),
        });
        document.free();
        return entry;
    }
    async getEpisodes(id: string, page: number): Promise<VideoEpisodeResults> {
        const document = Document.parse(await fetch(`${BASE_URL!}${id}`).then((res) => res.data));
        const ajaxId = document.getElementById("movie_id").getAttribute("value");
        document.free();
        const document2 = Document.parse(
            await fetch(`${AJAX_URL}/ajax/load-list-episode?ep_start=0&ep_end=1000000&id=${ajaxId}`).then((res) => `<html>${res.data}</html>`)
        );
        let episodes: VideoEpisode[] = [];
        for (const episode of document2.querySelectorAll("ul#episode_related > li > a")) {
            const href = episode.getAttribute("href").trim();
            const typeText = episode.querySelector("div.cate").innerText.toLowerCase();
            episodes.push(
                createVideoEpisode({
                    id: href,
                    entryId: id,
                    episode: parseFloat(href.match(/(?:.*?)episode-(\d+)/)?.[1] ?? "0"),
                    type: typeText === "sub" ? VideoEpisodeType.sub : typeText === "dub" ? VideoEpisodeType.dub : VideoEpisodeType.unknown,
                })
            );
        }
        document2.free();
        return createVideoEpisodeResults({
            page,
            hasMore: false,
            results: episodes,
        });
    }
    async getEpisodeDetails(id: string, entryId: string): Promise<VideoEpisodeDetails> {
        const document = Document.parse(await fetch(`${BASE_URL!}${id}`).then((res) => res.data));
        const gogoServerUrl = `${document.querySelector("div#load_anime > div > div > iframe").getAttribute("src")}`;
        const vidStreamingServerUrl = `${document
            .querySelector("div.anime_video_body > div.anime_muti_link > ul > li.vidcdn > a")
            .getAttribute("data-video")}`;
        const streamSBServerUrl = `${document
            .querySelector("div.anime_video_body > div.anime_muti_link > ul > li.streamsb > a")
            .getAttribute("data-video")}`;
        document.free();

        let promises: Promise<VideoEpisodeProvider>[] = [];
        if (gogoServerUrl.match(URL_REGEX) !== null) {
            promises.push(
                (async () =>
                    createVideoEpisodeProvider({
                        name: "GogoCDN",
                        urls: await this.getGogoCDNUrls(gogoServerUrl.startsWith("http") ? gogoServerUrl : `https:${gogoServerUrl}`),
                    }))()
            );
        }
        if (vidStreamingServerUrl.match(URL_REGEX) !== null) {
            promises.push(
                (async () =>
                    createVideoEpisodeProvider({
                        name: "Vidstreaming",
                        urls: await this.getGogoCDNUrls(
                            vidStreamingServerUrl.startsWith("http") ? vidStreamingServerUrl : `https:${vidStreamingServerUrl}`
                        ),
                    }))()
            );
        }
        if (streamSBServerUrl.match(URL_REGEX) !== null && !(this.getSettingsValue("disableStreamSB") === true)) {
            promises.push(
                (async () =>
                    createVideoEpisodeProvider({
                        name: "StreamSB",
                        urls: await this.getStreamSBUrls(streamSBServerUrl),
                    }))()
            );
        }

        const providers = (await Promise.all(promises))
            .filter((provider) => provider.urls.length > 0)
            .sort((a, b) =>
                a.name === this.getSettingsValue("preferredProvider") ? -1 : b.name === this.getSettingsValue("preferredProvider") ? 1 : 0
            );

        return createVideoEpisodeDetails({
            id,
            entryId,
            providers,
        });
    }
    async getFilters(): Promise<FilterGroup[]> {
        let document = Document.parse(await fetch(`${BASE_URL!}/filter.html`).then((res) => res.data));
        let genres = document.querySelectorAll("div.cls_genre > ul > li").map((el) => {
            return {
                id: `${el.querySelector("input").getAttribute("name")}=${el.querySelector("input").getAttribute("value")}`,
                name: el.innerText,
            };
        });
        let countries = document.querySelectorAll("div.cls_country > ul > li").map((el) => {
            return {
                id: `${el.querySelector("input").getAttribute("name")}=${el.querySelector("input").getAttribute("value")}`,
                name: el.innerText,
            };
        });
        let seasons = document.querySelectorAll("div.cls_season > ul > li").map((el) => {
            return {
                id: `${el.querySelector("input").getAttribute("name")}=${el.querySelector("input").getAttribute("value")}`,
                name: el.innerText,
            };
        });
        let years = document.querySelectorAll("div.cls_year > ul > li").map((el) => {
            return {
                id: `${el.querySelector("input").getAttribute("name")}=${el.querySelector("input").getAttribute("value")}`,
                name: el.innerText,
            };
        });
        let types = document.querySelectorAll("div.cls_type > ul > li").map((el) => {
            return {
                id: `${el.querySelector("input").getAttribute("name")}=${el.querySelector("input").getAttribute("value")}`,
                name: el.innerText,
            };
        });
        let statuses = document.querySelectorAll("div.cls_status > ul > li").map((el) => {
            return {
                id: `${el.querySelector("input").getAttribute("name")}=${el.querySelector("input").getAttribute("value")}`,
                name: el.innerText,
            };
        });
        let sort = document.querySelectorAll("div.cls_sort > ul > li").map((el) => {
            return {
                id: `${el.querySelector("input").getAttribute("name")}=${el.querySelector("input").getAttribute("value")}`,
                name: el.innerText,
            };
        });
        document.free();
        return [
            createFilterGroup({
                filters: [
                    createSortFilter({
                        id: "sort",
                        value: sort.map((item) => ({
                            selected: false,
                            ...item,
                        })),
                        name: "Sort",
                    }),
                    createMultiSelectFilter({
                        id: "genre",
                        value: genres.map((item) => ({
                            selected: false,
                            ...item,
                        })),
                        name: "Genre",
                    }),
                    createMultiSelectFilter({
                        id: "country",
                        value: countries.map((item) => ({
                            selected: false,
                            ...item,
                        })),
                        name: "Country",
                    }),
                    createMultiSelectFilter({
                        id: "season",
                        value: seasons.map((item) => ({
                            selected: false,
                            ...item,
                        })),
                        name: "Season",
                    }),
                    createMultiSelectFilter({
                        id: "year",
                        value: years.map((item) => ({
                            selected: false,
                            ...item,
                        })),
                        name: "Year",
                    }),
                    createMultiSelectFilter({
                        id: "type",
                        value: types.map((item) => ({
                            selected: false,
                            ...item,
                        })),
                        name: "Type",
                    }),
                    createMultiSelectFilter({
                        id: "status",
                        value: statuses.map((item) => ({
                            selected: false,
                            ...item,
                        })),
                        name: "Status",
                    }),
                ],
            }),
        ];
    }
    async getListings(): Promise<Listing[]> {
        return [
            createListing({
                id: "anime",
                name: "Anime",
                type: ListingType.basic,
            }),
            createListing({
                id: "cartoon",
                name: "Cartoon",
                type: ListingType.basic,
            }),
        ];
    }
    async getSettings(): Promise<FilterGroup[]> {
        return [
            createFilterGroup({
                header: "Providers",
                filters: [
                    createSegmentFilter({
                        id: "preferredProvider",
                        value: ["GogoCDN", "Vidstreaming", "StreamSB"].map((provider) => ({
                            id: provider,
                            name: provider,
                            selected: false,
                        })),
                        name: "Preferred Provider",
                    }),
                    createToggleFilter({
                        id: "disableStreamSB",
                        value: false,
                        name: "Disable StreamSB",
                    }),
                ],
                footer: "Disabling StreamSB could prevent some possible issues with episode loading.",
            }),
            createFilterGroup({
                header: "General",
                filters: [
                    createToggleFilter({
                        id: "disableDynamicUrl",
                        value: false,
                        name: "Disable Dynamic URL Fetching"
                    })
                ],
                footer: "Disabling dynamic URL fetching could prevent slow load times for some users."
            })
        ];
    }
    async modifyVideoRequest(url: string, options: FetchOptions): Promise<{ url: string; options: FetchOptions }> {
        let newHeaders: { [key: string]: string } = {
            Referer: url.match(/([^\?]*)\?(.*)/)?.[1] ?? "",
        };
        if (url.includes("akamai")) {
            // streamsb
            newHeaders["watchsb"] = "streamsb";
            newHeaders["User-Agent"] = USER_AGENT;
        }
        return {
            url,
            options: {
                headers: {
                    ...newHeaders,
                    ...(options.headers ?? {}),
                },
                ...(options ?? {}),
            },
        };
    }

    async getGogoCDNUrls(serverUrl: string): Promise<VideoEpisodeUrl[]> {
        const document = Document.parse(await fetch(serverUrl).then((res) => res.data));

        const id =
            serverUrl
                .match(/([^\?]*)\?(.*)/)?.[2]
                .split("&")
                .find((e) => e.split("=")[0] === "id")
                ?.match(/id=(.*)/)?.[1] ?? "";

        const iv = CryptoJS.enc.Utf8.parse(document.querySelector("div.wrapper").className.split("container-")[1]);
        const key = CryptoJS.enc.Utf8.parse(document.querySelector("body").className.split("container-")[1]);
        const secondKey = CryptoJS.enc.Utf8.parse(document.querySelector("div.videocontent").className.split("videocontent-")[1]);

        const encryptedKey = CryptoJS.AES.encrypt(id, key, { iv, padding: CryptoJS.pad.Pkcs7, mode: CryptoJS.mode.CBC });

        const scriptValue = document.querySelector("script[data-name='episode']").getAttribute("data-value");
        const decryptedToken = CryptoJS.AES.decrypt(scriptValue, key, { iv, padding: CryptoJS.pad.Pkcs7, mode: CryptoJS.mode.CBC }).toString(
            CryptoJS.enc.Utf8
        );

        const encryptedAjaxParams = decryptedToken.startsWith(id)
            ? `id=${encryptedKey}&alias=${decryptedToken}`
            : `id=${encryptedKey}&alias=${id}&${decryptedToken}`;

        document.free();

        const encryptedResponse = await fetch(
            `${serverUrl.match(/(https?:)[^\?]*\?.*/)?.[1] ?? "https:"}//${serverUrl.match(/https?:\/\/([^\/]*)/)?.[1] ?? ""
            }/encrypt-ajax.php?${encryptedAjaxParams}`,
            {
                headers: { "X-Requested-With": "XMLHttpRequest" },
            }
        );
        if (encryptedResponse.status !== 200) return [];

        const encryptedData = JSON.parse(encryptedResponse.data).data;

        const decryptedData = JSON.parse(
            CryptoJS.AES.decrypt(encryptedData, secondKey, { iv, padding: CryptoJS.pad.Pkcs7, mode: CryptoJS.mode.CBC }).toString(CryptoJS.enc.Utf8)
        );

        if (!decryptedData.source) return [];

        let episodes: VideoEpisodeUrl[] = [];
        if (decryptedData.source[0].file.includes(".m3u8")) {
            const res = await fetch(decryptedData.source[0].file.toString()).then((res) => res.data);
            const resolutions = res.match(/(RESOLUTION=)(.*)(\s*?)(\s*.*)/g);
            (resolutions ?? []).forEach((resolution: string) => {
                const index = decryptedData.source[0].file.lastIndexOf("/");
                const quality = resolution.split("\n")[0].split("x")[1].split(",")[0];
                const url = decryptedData.source[0].file.slice(0, index);
                episodes.push({
                    url: url + "/" + resolution.split("\n")[1],
                    quality: parseFloat(quality),
                });
            });

            decryptedData.source.forEach((source: any) => {
                episodes.push({
                    url: source.file,
                    quality: "UNKNOWN",
                });
            });
        } else {
            decryptedData.source.forEach((source: any) => {
                episodes.push({
                    url: source.file,
                    quality: parseFloat(source.label.split(" ")[0]),
                });
            });
        }

        decryptedData.source_bk.forEach((source: any) => {
            episodes.push({
                url: source.file,
                quality: "UNKNOWN",
            });
        });

        episodes.sort((e1, e2) => {
            if (typeof e1.quality === "number" && typeof e2.quality === "number") {
                return e2.quality - e1.quality;
            } else {
                return typeof e1.quality === "number" ? -1 : 1;
            }
        });

        return episodes;
    }

    async getStreamSBUrls(serverUrl: string): Promise<VideoEpisodeUrl[]> {
        const rawDocument = await fetch(serverUrl).then((res) => res.data);
        const match = rawDocument.match(/\'(ces\w{2,3})\'/)?.[1];
        let sourcesPath = typeof match === "string" ? `sour${match}` : null;
        if (sourcesPath === null) {
            const jsFile = rawDocument.match(/<script src=\"(\/js\/app\.min\.\d+\.js)\">/)?.[1];
            if (typeof jsFile !== "string") return [];
            sourcesPath = await fetch(STREAMSB_HOST + jsFile)
                .then((res) => res.data)
                .then((data) => {
                    const match = data.match(/\'(ces\w{2,3})\'/)?.[1];
                    return typeof match === "string" ? `sour${match}` : null;
                });
        }
        if (sourcesPath === null) return [];
        let id = serverUrl.split("/e/").pop();
        if (id?.includes("html")) id = id.split(".html")[0];
        if (typeof id === "undefined") return [];

        let hexEncoded = "";
        for (let i = 0; i < id.length; ++i) hexEncoded += ("0" + id.charCodeAt(i).toString(16)).slice(-2);

        const res = await fetch(`${STREAMSB_HOST}/${sourcesPath}/${STREAMSB_PAYLOAD_START}${hexEncoded}${STREAMSB_PAYLOAD_END}`, {
            headers: {
                watchsb: "sbstream",
                "User-Agent": USER_AGENT,
                Referer: serverUrl,
            },
        })
            .then((res) => {
                try {
                    return JSON.parse(res.data);
                } catch {
                    return null;
                }
            })
            .catch(() => null);
        if (typeof res?.stream_data === "undefined" || res?.stream_data === null) return [];

        const m3u8Urls = await fetch(res.stream_data.file, {
            headers: {
                "User-Agent": USER_AGENT,
                Referer: serverUrl.split("e/")[0],
                "Accept-Language": "en-US,en;q=0.9",
            },
        })
            .then((res) => res.data)
            .catch(() => null);
        if (m3u8Urls === null) return [];

        const videoList = m3u8Urls.split("#EXT-X-STREAM-INF:");

        let urls: VideoEpisodeUrl[] = [];
        for (const video of videoList ?? []) {
            if (!video.includes("m3u8")) continue;

            const url = video.split("\n")[1];
            const quality = video.split("RESOLUTION=")[1].split(",")[0].split("x")[1];
            urls.push({
                url: url,
                quality: parseFloat(quality),
            });
        }

        urls.push({
            url: res.stream_data.file,
            quality: "UNKNOWN",
        });

        return urls;
    }
}
