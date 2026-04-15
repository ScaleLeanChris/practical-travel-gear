/**
 * Gravatar URLs for byline authors.
 * Generated from WordPress author emails. The `d=mp` parameter
 * returns a generic silhouette for authors without a Gravatar.
 */
const GRAVATAR_URLS: Record<string, string> = {
	"tim-leffel": "https://www.gravatar.com/avatar/015c9feea4e2b227366049f49e9b4df5?s=80&d=mp",
	"kara": "https://www.gravatar.com/avatar/63b387e261f2e1f17807a4e1bab56fde?s=80&d=mp",
	"pam": "https://www.gravatar.com/avatar/4b41d9dfd25ffbb4b7c39494b950f07d?s=80&d=mp",
	"ramsey": "https://www.gravatar.com/avatar/af4842d6bb98654dccdbbe3f878fe36a?s=80&d=mp",
	"jill": "https://www.gravatar.com/avatar/81ac78e02122ce7d0453f70a2a33ec99?s=80&d=mp",
	"tim-guill": "https://www.gravatar.com/avatar/356363f582a69f70ae011a63b5322e74?s=80&d=mp",
	"ahmed": "https://www.gravatar.com/avatar/7819020432000971f137dbd04f382edf?s=80&d=mp",
	"eunil-gadiana": "https://www.gravatar.com/avatar/a6bb4919d2b3c0210f640de6e003f516?s=80&d=mp",
	"dana-rebmann": "https://www.gravatar.com/avatar/dc9681fe818497421edc0285000cdf62?s=80&d=mp",
};

// Default Gravatar "mystery person" for authors without a Gravatar
const DEFAULT_AVATAR = "https://www.gravatar.com/avatar/00000000000000000000000000000000?s=80&d=mp";

export function getBylineAvatar(slug: string): string {
	return GRAVATAR_URLS[slug] ?? DEFAULT_AVATAR;
}
