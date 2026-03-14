class FeedBarber {
  const FeedBarber({
    required this.id,
    required this.userId,
    required this.fullName,
    this.avatarUrl,
    required this.level,
    this.title,
    required this.isOnCall,
    required this.distanceKm,
  });

  final String id;
  final String userId;
  final String fullName;
  final String? avatarUrl;
  final int level;
  final String? title;
  final bool isOnCall;
  final double distanceKm;

  factory FeedBarber.fromJson(Map<String, dynamic> json) {
    return FeedBarber(
      id: json['id'] as String,
      userId: json['userId'] as String,
      fullName: (json['fullName'] as String?) ?? 'Unknown',
      avatarUrl: json['avatarUrl'] as String?,
      level: (json['level'] as num).toInt(),
      title: json['title'] as String?,
      isOnCall: json['isOnCall'] as bool? ?? false,
      distanceKm: (json['distanceKm'] as num).toDouble(),
    );
  }
}

class FeedItem {
  const FeedItem({
    required this.id,
    required this.mediaType,
    required this.cdnUrl,
    this.thumbnailUrl,
    this.caption,
    required this.likeCount,
    required this.viewCount,
    required this.createdAt,
    required this.barber,
  });

  final String id;
  final String mediaType;
  final String cdnUrl;
  final String? thumbnailUrl;
  final String? caption;
  final int likeCount;
  final int viewCount;
  final String createdAt;
  final FeedBarber barber;

  factory FeedItem.fromJson(Map<String, dynamic> json) {
    return FeedItem(
      id: json['id'] as String,
      mediaType: json['mediaType'] as String,
      cdnUrl: json['cdnUrl'] as String,
      thumbnailUrl: json['thumbnailUrl'] as String?,
      caption: json['caption'] as String?,
      likeCount: (json['likeCount'] as num).toInt(),
      viewCount: (json['viewCount'] as num).toInt(),
      createdAt: json['createdAt'] as String,
      barber: FeedBarber.fromJson(json['barber'] as Map<String, dynamic>),
    );
  }

  FeedItem copyWith({int? likeCount}) {
    return FeedItem(
      id: id,
      mediaType: mediaType,
      cdnUrl: cdnUrl,
      thumbnailUrl: thumbnailUrl,
      caption: caption,
      likeCount: likeCount ?? this.likeCount,
      viewCount: viewCount,
      createdAt: createdAt,
      barber: barber,
    );
  }
}

class NearbyBarber {
  const NearbyBarber({
    required this.id,
    required this.userId,
    required this.fullName,
    this.avatarUrl,
    required this.level,
    this.title,
    required this.isOnCall,
    required this.distanceKm,
    required this.averageRating,
    required this.totalRatings,
    this.totalVerifiedCuts = 0,
    this.lat,
    this.lng,
  });

  final String id;
  final String userId;
  final String fullName;
  final String? avatarUrl;
  final int level;
  final String? title;
  final bool isOnCall;
  final double distanceKm;
  final double averageRating;
  final int totalRatings;
  final int totalVerifiedCuts;
  final double? lat;
  final double? lng;

  factory NearbyBarber.fromJson(Map<String, dynamic> json) {
    return NearbyBarber(
      id: json['id'] as String,
      userId: json['user_id'] as String? ?? json['userId'] as String,
      fullName: (json['full_name'] as String?) ??
          (json['fullName'] as String?) ??
          'Unknown',
      avatarUrl:
          (json['avatar_url'] as String?) ?? (json['avatarUrl'] as String?),
      level: (json['level'] as num).toInt(),
      title: json['title'] as String?,
      isOnCall: (json['is_on_call'] as bool?) ??
          (json['isOnCall'] as bool?) ??
          false,
      distanceKm: (json['distance_km'] as num?)?.toDouble() ??
          (json['distanceKm'] as num?)?.toDouble() ??
          0.0,
      averageRating: double.tryParse(
              (json['average_rating'] ?? json['averageRating'] ?? '0')
                  .toString()) ??
          0.0,
      totalRatings: (json['total_ratings'] as num?)?.toInt() ??
          (json['totalRatings'] as num?)?.toInt() ??
          0,
      totalVerifiedCuts: (json['total_verified_cuts'] as num?)?.toInt() ??
          (json['totalVerifiedCuts'] as num?)?.toInt() ??
          0,
      lat: (json['lat'] as num?)?.toDouble(),
      lng: (json['lng'] as num?)?.toDouble(),
    );
  }
}
