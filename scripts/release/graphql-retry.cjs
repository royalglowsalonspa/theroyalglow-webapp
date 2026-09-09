// Release Please retries HTTP 502 but not GitHub's transient GraphQL errors
// returned with HTTP 200. Retry only read queries; mutations are never repeated.
function createRetryingFetch(
  fetchImpl,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
) {
  return async (url, init) => {
    let query
    try {
      query = JSON.parse(init?.body).query
    } catch {
      return fetchImpl(url, init)
    }
    if (
      String(url) !== 'https://api.github.com/graphql' ||
      typeof query !== 'string' ||
      !/^\s*query\b/.test(query)
    )
      return fetchImpl(url, init)

    for (let attempt = 0; ; attempt++) {
      const response = await fetchImpl(url, init)
      let transient = [502, 503, 504].includes(response.status)
      if (response.status === 200) {
        const body = await response.clone().json()
        transient =
          Array.isArray(body?.errors) &&
          body.errors.length > 0 &&
          body.errors.every(
            (error) =>
              typeof error.message === 'string' &&
              error.message.startsWith('Something went wrong while executing your query'),
          )
      }
      if (!transient || attempt === 3) return response
      console.warn(`Retrying transient GitHub history query failure (${attempt + 1}/3)`)
      await sleep(1000 * 2 ** attempt)
    }
  }
}

module.exports = { createRetryingFetch }

// Enabled only on the Release Please step, after checkout. Never log request
// bodies, headers, tokens, or response data.
// biome-ignore lint/suspicious/noUndeclaredEnvVars: Standalone Node preload, outside Turbo.
if (process.env.RELEASE_PLEASE_GRAPHQL_RETRY === '1') {
  globalThis.fetch = createRetryingFetch(globalThis.fetch)
}
