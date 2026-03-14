/// Models for the unified profile screen (GET /users/me response).
class ProfileUser {
  const ProfileUser({
    required this.id,
    required this.fullName,
    this.avatarUrl,
    required this.role,
    this.email,
    this.phone,
    required this.createdAt,
    required this.isActive,
  });

  final String id;
  final String fullName;
  final String? avatarUrl;
  final String role;
  final String? email;
  final String? phone;
  final DateTime createdAt;
  final bool isActive;

  factory ProfileUser.fromJson(Map<String, dynamic> json) {
    return ProfileUser(
      id: json['id'] as String,
      fullName: (json['fullName'] as String?) ?? 'Unknown',
      avatarUrl: json['avatarUrl'] as String?,
      role: json['role'] as String,
      email: json['email'] as String?,
      phone: json['phone'] as String?,
      createdAt: DateTime.parse(json['createdAt'] as String),
      isActive: json['isActive'] as bool? ?? true,
    );
  }
}

/// Barber-specific profile data from GET /users/me (nested barberProfile).
class ProfileBarberData {
  const ProfileBarberData({
    required this.id,
    required this.userId,
    required this.level,
    this.title,
    this.bio,
    this.instagramHandle,
    this.tiktokHandle,
    this.abn,
    this.aqfCertLevel,
    required this.serviceRadiusKm,
    this.certDocumentUrl,
  });

  final String id;
  final String userId;
  final int level;
  final String? title;
  final String? bio;
  final String? instagramHandle;
  final String? tiktokHandle;
  final String? abn;
  final String? aqfCertLevel;
  final int serviceRadiusKm;
  final String? certDocumentUrl;

  factory ProfileBarberData.fromJson(Map<String, dynamic> json) {
    return ProfileBarberData(
      id: json['id'] as String,
      userId: json['userId'] as String,
      level: (json['level'] as num).toInt(),
      title: json['title'] as String?,
      bio: json['bio'] as String?,
      instagramHandle: json['instagramHandle'] as String?,
      tiktokHandle: json['tiktokHandle'] as String?,
      abn: json['abn'] as String?,
      aqfCertLevel: json['aqfCertLevel'] as String?,
      serviceRadiusKm: (json['serviceRadiusKm'] as num?)?.toInt() ?? 10,
      certDocumentUrl: json['certDocumentUrl'] as String?,
    );
  }
}

/// Studio-specific profile data from GET /users/me (nested studioProfile).
class ProfileStudioData {
  const ProfileStudioData({
    required this.id,
    required this.userId,
    required this.businessName,
    this.abn,
    this.addressLine1,
    this.addressLine2,
    this.suburb,
    this.state,
    this.postcode,
    required this.isVerified,
  });

  final String id;
  final String userId;
  final String businessName;
  final String? abn;
  final String? addressLine1;
  final String? addressLine2;
  final String? suburb;
  final String? state;
  final String? postcode;
  final bool isVerified;

  factory ProfileStudioData.fromJson(Map<String, dynamic> json) {
    return ProfileStudioData(
      id: json['id'] as String,
      userId: json['userId'] as String,
      businessName: json['businessName'] as String,
      abn: json['abn'] as String?,
      addressLine1: json['addressLine1'] as String?,
      addressLine2: json['addressLine2'] as String?,
      suburb: json['suburb'] as String?,
      state: json['state'] as String?,
      postcode: json['postcode'] as String?,
      isVerified: json['isVerified'] as bool? ?? false,
    );
  }
}

/// Combined profile data for the unified profile screen.
class ProfileData {
  const ProfileData({
    required this.user,
    this.barberProfile,
    this.studioProfile,
  });

  final ProfileUser user;
  final ProfileBarberData? barberProfile;
  final ProfileStudioData? studioProfile;

  factory ProfileData.fromJson(Map<String, dynamic> json) {
    return ProfileData(
      user: ProfileUser.fromJson(json),
      barberProfile: json['barberProfile'] != null
          ? ProfileBarberData.fromJson(
              json['barberProfile'] as Map<String, dynamic>)
          : null,
      studioProfile: json['studioProfile'] != null
          ? ProfileStudioData.fromJson(
              json['studioProfile'] as Map<String, dynamic>)
          : null,
    );
  }
}
