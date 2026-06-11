-- ==============================================================================
-- PARCHE DE SEGURIDAD (RLS) - DENTALA
-- Fecha: 2026-06-11
-- Descripción: Creación de políticas de aislamiento estricto para tablas 
-- que tenían RLS activado pero sin políticas definidas (Default: DENY ALL).
-- ==============================================================================

-- 1. Tabla: wishlist
CREATE POLICY "Dentist access own wishlist" ON public.wishlist
    FOR ALL USING (auth.uid() = dentist_id);

-- 2. Tabla: whatsapp_message_log
CREATE POLICY "Dentist access own whatsapp_logs" ON public.whatsapp_message_log
    FOR ALL USING (auth.uid() = dentist_id);

-- 3. Tabla: faq_textual
CREATE POLICY "Dentist access own faqs" ON public.faq_textual
    FOR ALL USING (auth.uid() = dentist_id);

-- 4. Tabla: kpis_analytics
CREATE POLICY "Dentist access own kpis" ON public.kpis_analytics
    FOR ALL USING (auth.uid() = dentist_id);

-- 5. Tabla: dentist_schedule_exceptions
CREATE POLICY "Dentist access own schedule_exceptions" ON public.dentist_schedule_exceptions
    FOR ALL USING (auth.uid() = dentist_id);

-- 6. Tabla: treatment_documents
CREATE POLICY "Dentist access own treatment_documents" ON public.treatment_documents
    FOR ALL USING (auth.uid() = dentist_id);

-- 7. Tabla: wishlist_batch_tracking
CREATE POLICY "Dentist access own wishlist_batch_tracking" ON public.wishlist_batch_tracking
    FOR ALL USING (auth.uid() = dentist_id);

-- ==============================================================================
-- FIN DEL PARCHE
-- ==============================================================================
