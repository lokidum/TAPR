class BarberUser {
  const BarberUser({
    required this.id,
    required this.fullName,
    this.avatarUrl,
  });

  final String id;
  final String fullName;
  final String? avatarUrl;

  factory BarberUser.fromJson(Map<String, dynamic> json) {
    return BarberUser(
      id: json['id'] as String,
      fullName: (json['fullName'] as String?) ?? 'Unknown',
      avatarUrl: json['avatarUrl'] as String?,
    );
  }
}

class BarberProfileDetail {
  const BarberProfileDetail({
    required this.id,
    required this.userId,
    required this.level,
    this.title,
    required this.totalVerifiedCuts,
    required this.averageRating,
    required this.totalRatings,
    this.bio,
    required this.isOnCall,
    required this.serviceRadiusKm,
    required this.user,
  });

  final String id;
  final String userId;
  final int level;
  final String? title;
  final int totalVerifiedCuts;
  final double averageRating;
  final int totalRatings;
  final String? bio;
  final bool isOnCall;
  final int serviceRadiusKm;
  final BarberUser user;

  factory BarberProfileDetail.fromJson(Map<String, dynamic> json) {
    return BarberProfileDetail(
      id: json['id'] as String,
      userId: json['userId'] as String,
      level: (json['level'] as num).toInt(),
      title: json['title'] as String?,
      totalVerifiedCuts: (json['totalVerifiedCuts'] as num?)?.toInt() ?? 0,
      averageRating: double.tryParse(
              (json['averageRating'] ?? '0').toString()) ??
          0.0,
      totalRatings: (json['totalRatings'] as num?)?.toInt() ?? 0,
      bio: json['bio'] as String?,
      isOnCall: json['isOnCall'] as bool? ?? false,
      serviceRadiusKm: (json['serviceRadiusKm'] as num?)?.toInt() ?? 10,
      user: BarberUser.fromJson(json['user'] as Map<String, dynamic>),
    );
  }
}

class PortfolioItemModel {
  const PortfolioItemModel({
    required this.id,
    required this.mediaType,
    required this.cdnUrl,
    this.thumbnailUrl,
    this.caption,
    required this.likeCount,
    required this.viewCount,
    required this.createdAt,
    this.isFeatured = false,
    this.barberId,
  });

  final String id;
  final String mediaType;
  final String cdnUrl;
  final String? thumbnailUrl;
  final String? caption;
  final int likeCount;
  final int viewCount;
  final String createdAt;
  final bool isFeatured;
  final String? barberId;

  factory PortfolioItemModel.fromJson(Map<String, dynamic> json) {
    return PortfolioItemModel(
      id: json['id'] as String,
      mediaType: json['mediaType'] as String,
      cdnUrl: json['cdnUrl'] as String,
      thumbnailUrl: json['thumbnailUrl'] as String?,
      caption: json['caption'] as String?,
      likeCount: (json['likeCount'] as num?)?.toInt() ?? 0,
      viewCount: (json['viewCount'] as num?)?.toInt() ?? 0,
      createdAt: json['createdAt'].toString(),
      isFeatured: json['isFeatured'] as bool? ?? false,
      barberId: json['barberId'] as String?,
    );
  }

  PortfolioItemModel copyWith({
    String? caption,
    bool? isFeatured,
  }) {
    return PortfolioItemModel(
      id: id,
      mediaType: mediaType,
      cdnUrl: cdnUrl,
      thumbnailUrl: thumbnailUrl,
      caption: caption ?? this.caption,
      likeCount: likeCount,
      viewCount: viewCount,
      createdAt: createdAt,
      isFeatured: isFeatured ?? this.isFeatured,
      barberId: barberId,
    );
  }
}

class ReviewConsumer {
  const ReviewConsumer({
    required this.firstName,
    this.avatarUrl,
  });

  final String firstName;
  final String? avatarUrl;

  factory ReviewConsumer.fromJson(Map<String, dynamic> json) {
    return ReviewConsumer(
      firstName: (json['firstName'] as String?) ?? 'Anonymous',
      avatarUrl: json['avatarUrl'] as String?,
    );
  }
}

class BarberReview {
  const BarberReview({
    required this.id,
    required this.cutRating,
    required this.experienceRating,
    this.reviewText,
    required this.reviewedAt,
    required this.consumer,
  });

  final String id;
  final int cutRating;
  final int experienceRating;
  final String? reviewText;
  final String reviewedAt;
  final ReviewConsumer consumer;

  factory BarberReview.fromJson(Map<String, dynamic> json) {
    return BarberReview(
      id: json['id'] as String,
      cutRating: (json['cutRating'] as num).toInt(),
      experienceRating: (json['experienceRating'] as num).toInt(),
      reviewText: json['reviewText'] as String?,
      reviewedAt: json['reviewedAt'].toString(),
      consumer:
          ReviewConsumer.fromJson(json['consumer'] as Map<String, dynamic>),
    );
  }
}
