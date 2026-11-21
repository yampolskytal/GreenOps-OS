# Historical replay provenance

The raw public German generation series is from [Fraunhofer ISE Energy-Charts](https://api.energy-charts.info/public_power?country=de&start=2026-08-30&end=2026-09-01), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The converted hourly CSV weights quarter-hour generation by reference direct emissions factors from [IPCC AR5 Table A.III.2](https://www.ipcc.ch/site/assets/uploads/2018/02/ipcc_wg3_ar5_annex-iii.pdf).

The proxy uses the IPCC direct coal and combined-cycle gas medians of 0.76 and 0.37 kg CO₂e/kWh. It applies the coal median to lignite, coal-derived gas, and oil as a coarse proxy. Other generation contributes zero to the modeled numerator. Imports, storage consumption and trading are excluded. The result is suitable for a historical scenario comparison and does not establish German consumption intensity or marginal grid emissions.

Regenerate the CSV from the archived source with:

    python grid_replay.py bonus-evidence/de-generation.json bonus-evidence/de-hourly-replay.csv
