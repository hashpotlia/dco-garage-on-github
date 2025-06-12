export const runbookDetector = {
		patterns: {
			hostType: /\[(EC2[a-zA-Z0-9]*)\]/,
			hardwareId: /(((FOX)|(SNX)|(QCI)|(ZT)|(JBL)|(WYN))\.[a-zA-Z0-9]*)/,
			region: /([A-Z]{3}\d{2,3})/,
			deviceName: /([a-z]{3}[0-9]{2}-[a-z0-9\-]*)/g,
			issueType: /VETTING_([A-Z_]+)/,
			workDefinitionId: /Work-Definition-ID = (\d+)/,
			rackId: /RACK[_-]([A-Z0-9]+)/,
			pscId: /PSC[_-]([A-Z0-9]+)/,
			vendor: /^(FOX|SNX|QCI|ZT|JBL|WYN)/,
			component: /(PSU|DIMM|NIC|PSC|BMC|CPU|MEMORY|DISK|SSD)/i
		},

		extractInfo: function(searchText) {
			const info = {};
			
			Object.entries(this.patterns).forEach(([key, pattern]) => {
				const match = searchText.match(pattern);
				if (match) {
					if (key === 'deviceName') {
						info[key] = match;
					} else {
						info[key] = match[1] || match[0];
					}
				}
			});
			
			return info;
		},

		suggestRunbooks: function(extractedInfo, originalSearchText = '') {
			const suggestions = [];
			
			// PHASE 1: Database-driven suggestions (high confidence)
			runbookData.forEach(runbook => {
				let score = 0;
				let matchReasons = [];
				
				// Host type matching (highest priority)
				if (extractedInfo.hostType && runbook.hostTypes && 
					runbook.hostTypes.includes(extractedInfo.hostType)) {
					score += 40;
					matchReasons.push(`Host Type: ${extractedInfo.hostType}`);
				}
				
				// Issue type matching
				if (extractedInfo.issueType && runbook.issueTypes && 
					runbook.issueTypes.includes(`VETTING_${extractedInfo.issueType}`)) {
					score += 30;
					matchReasons.push(`Issue: ${extractedInfo.issueType}`);
				}
				
				// Vendor matching
				if (extractedInfo.vendor && runbook.vendors && 
					runbook.vendors.includes(extractedInfo.vendor)) {
					score += 20;
					matchReasons.push(`Vendor: ${extractedInfo.vendor}`);
				}
				
				// Component matching
				if (extractedInfo.component && runbook.components && 
					runbook.components.includes(extractedInfo.component.toUpperCase())) {
					score += 25;
					matchReasons.push(`Component: ${extractedInfo.component}`);
				}
				
				// Tag matching (fuzzy)
				if (runbook.tags) {
					const searchLower = originalSearchText.toLowerCase();
					const extractedLower = Object.values(extractedInfo).join(' ').toLowerCase();
					
					runbook.tags.forEach(tag => {
						const tagLower = tag.toLowerCase();
						// Check both original search text AND extracted info
						if (searchLower.includes(tagLower) || extractedLower.includes(tagLower)) {
							score += 15; // Increased score for tag matches
							matchReasons.push(`Tag: ${tag}`);
						}
					});
				}
				
				if (score > 0) {
					suggestions.push({
						...runbook,
						matchScore: score,
						matchReasons: matchReasons,
						finalConfidence: Math.min(95, runbook.confidence + score),
						source: 'database'
					});
				}
			});

			// PHASE 2: Auto-Generated fallback (medium to high confidence)
			if (extractedInfo.hostType) {
				const fallbackRunbook = this.generateFallbackRunbook(extractedInfo);
				
				// Only add if we don't already have a database match for this host type
				const hasExactMatch = suggestions.some(s => 
					s.hostTypes && s.hostTypes.includes(extractedInfo.hostType)
				);
				
				if (!hasExactMatch) {
					suggestions.push(fallbackRunbook);
				}
			}

			// PHASE 3: Generic fallbacks (low confidence)
			if (suggestions.length === 0) {
				suggestions.push(...this.generateGenericFallbacks(extractedInfo));
			}
			
			return suggestions
				.sort((a, b) => b.matchScore - a.matchScore)
				.slice(0, 6); // Top 6 suggestions
		},

		generateFallbackRunbook: function(extractedInfo) {
			const hostType = extractedInfo.hostType;
			const matchReasons = [`Host Type: ${hostType} (Auto-Generated)`];
			
			if (extractedInfo.vendor) {
				matchReasons.push(`Vendor: ${extractedInfo.vendor}`);
			}
			if (extractedInfo.issueType) {
				matchReasons.push(`Issue: ${extractedInfo.issueType}`);
			}
			
			return {
				id: `fallback-${hostType.toLowerCase()}`,
				title: `${hostType} Standard Vetting Runbook`,
				url: `https://w.amazon.com/bin/view/VettingDCORunbook/${hostType}`,
				matchScore: 35,
				finalConfidence: 85,
				icon: '📖',
				category: 'Standard Runbook',
				matchReasons: matchReasons,
				source: 'fallback',
				hostTypes: [hostType]
			};
		},

		generateGenericFallbacks: function(extractedInfo) {
			const fallbacks = [];
			
			// Vendor-specific fallback
			if (extractedInfo.vendor) {
				fallbacks.push({
					id: `vendor-${extractedInfo.vendor.toLowerCase()}`,
					title: `${this.getVendorName(extractedInfo.vendor)} Hardware Guide`,
					url: `https://w.amazon.com/bin/view/HardwareRunbooks/${this.getVendorName(extractedInfo.vendor)}`,
					matchScore: 25,
					finalConfidence: 65,
					icon: '🔧',
					category: 'Vendor Guide',
					matchReasons: [`Vendor: ${extractedInfo.vendor}`],
					source: 'generic'
				});
			}
			
			// Issue-specific fallback
			if (extractedInfo.issueType) {
				fallbacks.push({
					id: `issue-${extractedInfo.issueType.toLowerCase()}`,
					title: `${extractedInfo.issueType.replace('_', ' ')} Troubleshooting Guide`,
					url: `https://w.amazon.com/bin/view/DCOSE/Documentation/Runbooks/${extractedInfo.issueType}`,
					matchScore: 20,
					finalConfidence: 60,
					icon: '🔍',
					category: 'Issue Guide',
					matchReasons: [`Issue Type: ${extractedInfo.issueType}`],
					source: 'generic'
				});
			}
		   
			return fallbacks;
		},

		getVendorName: function(vendorCode) {
			const vendorMap = {
				'FOX': 'Foxconn',
				'SNX': 'Supermicro', 
				'QCI': 'Quanta',
				'ZT': 'ZT_Systems',
				'JBL': 'Jabil',
				'WYN': 'Wiwynn'
			};
			return vendorMap[vendorCode] || vendorCode;
		}
	};

