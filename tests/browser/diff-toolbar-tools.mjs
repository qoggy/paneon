/** Select a layout through the real toolbar menu; menu content is portalled into the frame. */
export async function selectDiffLayout(frame, layout, source = frame) {
  await source.getByRole('button', { name: '对比方式', exact: true }).click();
  await frame.getByRole('menuitemradio', { name: layout, exact: true }).click();
}
