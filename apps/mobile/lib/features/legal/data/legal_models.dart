/// Partnership status from the API.
enum PartnershipStatus {
  draft,
  sent,
  partiallySigned,
  fullyExecuted,
  dissolved;

  static PartnershipStatus fromString(String value) {
    return switch (value) {
      'draft' => PartnershipStatus.draft,
      'sent' => PartnershipStatus.sent,
      'partially_signed' => PartnershipStatus.partiallySigned,
      'fully_executed' => PartnershipStatus.fullyExecuted,
      'dissolved' => PartnershipStatus.dissolved,
      _ => PartnershipStatus.draft,
    };
  }

  String get displayLabel => switch (this) {
        PartnershipStatus.draft => 'Draft',
        PartnershipStatus.sent => 'Sent',
        PartnershipStatus.partiallySigned => 'Partially Signed',
        PartnershipStatus.fullyExecuted => 'Signed',
        PartnershipStatus.dissolved => 'Dissolved',
      };
}

/// Structure type for a partnership.
enum PartnershipStructureType {
  unincorporatedJv,
  incorporatedJv,
  partnership;

  static PartnershipStructureType fromString(String value) {
    return switch (value) {
      'unincorporated_jv' => PartnershipStructureType.unincorporatedJv,
      'incorporated_jv' => PartnershipStructureType.incorporatedJv,
      'partnership' => PartnershipStructureType.partnership,
      _ => PartnershipStructureType.unincorporatedJv,
    };
  }

  String get apiValue => switch (this) {
        PartnershipStructureType.unincorporatedJv => 'unincorporated_jv',
        PartnershipStructureType.incorporatedJv => 'incorporated_jv',
        PartnershipStructureType.partnership => 'partnership',
      };

  String get displayLabel => switch (this) {
        PartnershipStructureType.unincorporatedJv => 'Unincorporated JV',
        PartnershipStructureType.incorporatedJv => 'Incorporated JV',
        PartnershipStructureType.partnership => 'Partnership',
      };
}

/// Barber reference within a partnership.
class PartnershipBarberRef {
  const PartnershipBarberRef({
    required this.id,
    required this.fullName,
  });

  final String id;
  final String fullName;

  factory PartnershipBarberRef.fromJson(Map<String, dynamic> json) {
    final user = json['user'] as Map<String, dynamic>?;
    return PartnershipBarberRef(
      id: json['id'] as String,
      fullName: (user?['fullName'] as String?) ?? 'Unknown',
    );
  }
}

/// Partnership model from GET /partnerships/me.
class Partnership {
  const Partnership({
    required this.id,
    required this.initiatingBarber,
    required this.partnerBarber,
    this.businessName,
    this.state,
    required this.structureType,
    required this.equitySplitPctInitiator,
    required this.equitySplitPctPartner,
    required this.platformEquityPct,
    required this.vestingMonths,
    required this.cliffMonths,
    required this.status,
    required this.createdAt,
  });

  final String id;
  final PartnershipBarberRef initiatingBarber;
  final PartnershipBarberRef partnerBarber;
  final String? businessName;
  final String? state;
  final PartnershipStructureType structureType;
  final int equitySplitPctInitiator;
  final int equitySplitPctPartner;
  final int platformEquityPct;
  final int vestingMonths;
  final int cliffMonths;
  final PartnershipStatus status;
  final String createdAt;

  factory Partnership.fromJson(Map<String, dynamic> json) {
    return Partnership(
      id: json['id'] as String,
      initiatingBarber: PartnershipBarberRef.fromJson(
        json['initiatingBarber'] as Map<String, dynamic>,
      ),
      partnerBarber: PartnershipBarberRef.fromJson(
        json['partnerBarber'] as Map<String, dynamic>,
      ),
      businessName: json['businessName'] as String?,
      state: json['state'] as String?,
      structureType: PartnershipStructureType.fromString(
        json['structureType'] as String? ?? 'unincorporated_jv',
      ),
      equitySplitPctInitiator: (json['equitySplitPctInitiator'] as num?)?.toInt() ??
          (json['equity_split_pct_initiator'] as num?)?.toInt() ??
          0,
      equitySplitPctPartner: (json['equitySplitPctPartner'] as num?)?.toInt() ??
          (json['equity_split_pct_partner'] as num?)?.toInt() ??
          0,
      platformEquityPct: (json['platformEquityPct'] as num?)?.toInt() ??
          (json['platform_equity_pct'] as num?)?.toInt() ??
          7,
      vestingMonths: (json['vestingMonths'] as num?)?.toInt() ??
          (json['vesting_months'] as num?)?.toInt() ??
          48,
      cliffMonths: (json['cliffMonths'] as num?)?.toInt() ??
          (json['cliff_months'] as num?)?.toInt() ??
          12,
      status: PartnershipStatus.fromString(
        json['status'] as String? ?? 'draft',
      ),
      createdAt: json['createdAt']?.toString() ?? json['created_at']?.toString() ?? '',
    );
  }

  /// Partner name from the current user's perspective (the other barber).
  String partnerDisplayName(String myBarberId) {
    if (initiatingBarber.id == myBarberId) {
      return partnerBarber.fullName;
    }
    return initiatingBarber.fullName;
  }
}

/// Barber eligible for partnership (Level 5+).
class PartnershipEligibleBarber {
  const PartnershipEligibleBarber({
    required this.id,
    required this.fullName,
    this.avatarUrl,
    required this.level,
    this.title,
  });

  final String id;
  final String fullName;
  final String? avatarUrl;
  final int level;
  final String? title;

  factory PartnershipEligibleBarber.fromJson(Map<String, dynamic> json) {
    return PartnershipEligibleBarber(
      id: json['id'] as String,
      fullName: (json['fullName'] as String?) ?? 'Unknown',
      avatarUrl: json['avatarUrl'] as String?,
      level: (json['level'] as num).toInt(),
      title: json['title'] as String?,
    );
  }
}

/// Legal document types for the Legal Documents section.
enum LegalDocumentType {
  coOpJointVenture,
  salonLicense,
  independentContractor;

  String get title => switch (this) {
        LegalDocumentType.coOpJointVenture => 'Co-Op Joint Venture Agreement',
        LegalDocumentType.salonLicense => 'Salon License Agreement',
        LegalDocumentType.independentContractor =>
          'Independent Contractor Agreement',
      };

  String get description => switch (this) {
        LegalDocumentType.coOpJointVenture =>
          'Formalize a joint venture with another Level 5+ barber. Includes equity split, vesting, and platform terms.',
        LegalDocumentType.salonLicense =>
          'License agreement for operating within a salon or studio.',
        LegalDocumentType.independentContractor =>
          'Agreement for independent contractor relationships.',
      };
}
