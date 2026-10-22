/** Apply the DPI cap before scaling, so low quality still reduces retina-phone resolution. */
export const renderDensity = (deviceDpr: number, scale: number): number => Math.min(1.5, Math.min(1.5, deviceDpr) * scale);
