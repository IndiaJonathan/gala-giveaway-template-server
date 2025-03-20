/**
 * Utility functions for working with giveaway data
 */

/**
 * Filters out sensitive or internal fields from a giveaway object
 * @param giveaway The giveaway object to filter
 * @returns A new object with sensitive fields removed
 */
export const filterGiveawayData = (giveaway: any): any => {
  if (!giveaway) return null;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { giveawayErrors, ...filteredGiveaway } = giveaway;
  return filteredGiveaway;
};

/**
 * Filters out sensitive or internal fields from an array of giveaway objects
 * @param giveaways Array of giveaway objects to filter
 * @returns A new array with sensitive fields removed from each giveaway
 */
export const filterGiveawaysData = (giveaways: any[]): any[] => {
  if (!giveaways || !Array.isArray(giveaways)) return [];

  return giveaways.map(filterGiveawayData);
};
