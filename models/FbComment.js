const supabase = require("../supabase/client");

const TABLE = "fb_comments";

const FbComment = {
    /**
     * Upsert a comment (insert or update on conflict by id).
     * @param {{
     *   id: string,
     *   postId: string,
     *   userName?: string,
     *   commentText?: string,
     *   commentDate?: string,
     *   commentTime?: string,
     *   barangay?: string,
     *   incidentType?: string
     * }} data
     */
    async upsert(data) {
        const row = {
            id: data.id,
            post_id: data.postId || data.post_id,
            user_name: data.userName || data.user_name || "Unknown",
            comment_text: data.commentText || data.comment_text || "",
            comment_date: data.commentDate || data.comment_date,
            comment_time: data.commentTime || data.comment_time,
            barangay: data.barangay || "Unknown",
            incident_type: data.incidentType !== undefined ? data.incidentType : data.incident_type
        };

        const { data: upserted, error } = await supabase
            .from(TABLE)
            .upsert(row, { onConflict: "id" })
            .select()
            .single();

        if (error) throw new Error(`Supabase comment upsert error: ${error.message}`);
        return upserted;
    },

    /**
     * Fetch recent comments.
     * @param {number} limit
     */
    async findRecent(limit = 100) {
        const { data, error } = await supabase
            .from(TABLE)
            .select("*")
            .order("comment_date", { ascending: false })
            .limit(limit);

        if (error) throw new Error(`Supabase comment fetch error: ${error.message}`);
        return data || [];
    }
};

module.exports = FbComment;
