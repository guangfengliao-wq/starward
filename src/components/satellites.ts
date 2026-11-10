type Satellite = readonly [name: string, distanceKm: number, periodDays: number, radiusKm: number,
  color: number, inclinationDegrees?: number]

// Mean distances and periods from JPL SSD. Radii are rounded for the display model.
// https://ssd.jpl.nasa.gov/sats/elem/
// https://ssd.jpl.nasa.gov/sats/phys_par/
export const satelliteGroups: Record<string, readonly Satellite[]> = {
  earth: [['月球', 384400, 27.322, 1737.4, 0xb6b4b0, 5.16]],
  mars: [
    ['火卫一', 9375, 0.3187, 11.1, 0x908475],
    ['火卫二', 23457, 1.2625, 6.2, 0xa89984],
  ],
  jupiter: [
    ['木卫一', 421800, 1.762732, 1822, 0xdcc45f],
    ['木卫二', 671100, 3.525463, 1561, 0xd4bd9b],
    ['木卫三', 1070400, 7.155588, 2631, 0x9b8e7e],
    ['木卫四', 1882700, 16.690440, 2410, 0x786b63],
  ],
  saturn: [
    ['土卫一', 186000, 0.942422, 198, 0xb2aeaa],
    ['土卫二', 238400, 1.370218, 252, 0xe7ebee],
    ['土卫三', 295000, 1.887802, 531, 0xcdc9c2],
    ['土卫四', 377700, 2.736916, 561, 0xbebcba],
    ['土卫五', 527200, 4.517503, 764, 0xc3c0b8],
    ['土卫六', 1221900, 15.945448, 2575, 0xe5ab62],
    ['土卫八', 3561700, 79.331002, 735, 0x9a8b79, 7.6],
  ],
  uranus: [
    ['天卫五', 129846, 1.413479, 236, 0xb3b3ad, 4.4],
    ['天卫一', 190929, 2.520379, 579, 0xc8c6c3],
    ['天卫二', 265986, 4.144177, 585, 0x8d8885],
    ['天卫三', 436298, 8.705869, 789, 0xb6aaa1],
    ['天卫四', 583511, 13.463237, 761, 0xa0948b],
  ],
  neptune: [
    ['海卫八', 117700, 1.1229, 210, 0x9b9591],
    ['海卫一', 354800, 5.8792, 1353, 0xcdbfb6, 157.3],
  ],
}
