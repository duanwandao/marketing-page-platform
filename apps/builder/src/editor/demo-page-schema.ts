import type { PageSchema } from "@mpp/schema";

export const demoPageSchema: PageSchema = {
  schemaVersion: 1,
  id: "mid-autumn-demo",
  title: "中秋外卖大促",
  components: [
    {
      id: "banner-1",
      type: "Banner",
      props: {
        title: "中秋团圆饭",
        image: "",
        backgroundColor: "#fff4d6"
      }
    },
    {
      id: "coupon-1",
      type: "Coupon",
      props: {
        title: "中秋专享券",
        amount: 20,
        threshold: 50
      }
    }
  ]
};
