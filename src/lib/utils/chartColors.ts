import { browser } from '$app/environment';

export interface ChartColors {
	primary: string;
	grid: string;
	label: string;
}

let cachedColors: ChartColors | null = null;
let extractionPromise: Promise<ChartColors> | null = null;

function extractColorsFromDOM(): ChartColors {
	const el = Object.assign(document.createElement('div'), {
		className: 'text-primary bg-transparent',
		style: 'position:absolute;visibility:hidden'
	});
	document.body.appendChild(el);

	const primaryColor = getComputedStyle(el).color;
	el.className = 'text-base-content/20 bg-transparent';
	const gridColor = getComputedStyle(el).color;
	el.className = 'text-base-content/60 bg-transparent';
	const labelColor = getComputedStyle(el).color;

	el.remove();

	return { primary: primaryColor, grid: gridColor, label: labelColor };
}

export async function getChartColors(): Promise<ChartColors> {
	if (cachedColors) return cachedColors;
	if (!browser) {
		return { primary: 'rgb(0, 0, 0)', grid: 'rgb(200, 200, 200)', label: 'rgb(100, 100, 100)' };
	}

	if (!extractionPromise) {
		extractionPromise = Promise.resolve().then(() => extractColorsFromDOM());
	}
	return extractionPromise;
}
