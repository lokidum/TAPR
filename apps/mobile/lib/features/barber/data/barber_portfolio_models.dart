class PortfolioStats {
  const PortfolioStats({
    required this.totalItems,
    required this.totalViews,
    required this.totalLikes,
  });

  final int totalItems;
  final int totalViews;
  final int totalLikes;

  factory PortfolioStats.fromJson(Map<String, dynamic> json) {
    return PortfolioStats(
      totalItems: (json['totalItems'] as num).toInt(),
      totalViews: (json['totalViews'] as num).toInt(),
      totalLikes: (json['totalLikes'] as num).toInt(),
    );
  }
}
