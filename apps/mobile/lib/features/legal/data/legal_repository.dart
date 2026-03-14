import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tapr/core/network/api_client.dart';
import 'package:tapr/features/legal/data/legal_models.dart';

class LegalRepository {
  LegalRepository(this._dio);

  final Dio _dio;

  Future<({List<Partnership> partnerships, int total})> fetchMyPartnerships({
    int page = 1,
    int limit = 20,
  }) async {
    final response = await _dio.get<Map<String, dynamic>>(
      '/partnerships/me',
      queryParameters: {'page': page, 'limit': limit},
    );

    final data = response.data!['data'] as List<dynamic>;
    final partnerships = data
        .map((e) => Partnership.fromJson(e as Map<String, dynamic>))
        .toList();

    final meta = response.data!['meta'] as Map<String, dynamic>?;
    final pagination = meta?['pagination'] as Map<String, dynamic>?;
    final total = pagination != null
        ? (pagination['total'] as num).toInt()
        : partnerships.length;

    return (partnerships: partnerships, total: total);
  }

  Future<List<PartnershipEligibleBarber>> searchPartnershipEligibleBarbers({
    String? q,
    int limit = 20,
  }) async {
    final response = await _dio.get<Map<String, dynamic>>(
      '/barbers/partnership-eligible',
      queryParameters: {
        if (q != null && q.isNotEmpty) 'q': q,
        'limit': limit,
      },
    );

    final data = response.data!['data'] as List<dynamic>;
    return data
        .map((e) => PartnershipEligibleBarber.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<Partnership> createPartnership({
    required String partnerBarberId,
    String? businessName,
    String? state,
    required String structureType,
    required int equitySplitInitiator,
    required int equitySplitPartner,
    required int vestingMonths,
    required int cliffMonths,
    int platformEquityPct = 7,
  }) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/partnerships',
      data: {
        'partnerBarberId': partnerBarberId,
        if (businessName != null && businessName.isNotEmpty) 'businessName': businessName,
        if (state != null && state.isNotEmpty) 'state': state,
        'structureType': structureType,
        'equitySplitInitiator': equitySplitInitiator,
        'equitySplitPartner': equitySplitPartner,
        'platformEquityPct': platformEquityPct,
        'vestingMonths': vestingMonths,
        'cliffMonths': cliffMonths,
      },
    );

    final data = response.data!['data'] as Map<String, dynamic>;
    return Partnership.fromJson(data);
  }

  Future<Partnership> sendPartnership(String partnershipId) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/partnerships/$partnershipId/send',
    );

    final data = response.data!['data'] as Map<String, dynamic>;
    return Partnership.fromJson(data);
  }
}

final legalRepositoryProvider = Provider<LegalRepository>((ref) {
  return LegalRepository(ref.read(dioProvider));
});
